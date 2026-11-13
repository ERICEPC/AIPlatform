"""Short-lived personal-assistant capability: manage owned Agent drafts; publication follows the resource visibility policy."""
import base64, hashlib, hmac, json, os, time
from flask import request
from flask_restx import Resource
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from werkzeug.exceptions import BadRequest, Forbidden
from controllers.console import console_ns
from extensions.ext_database import db
from models.account import Account, TenantAccountJoin
from models.agent import Agent, AgentStatus
from .personal import service_token, read_state

PURPOSE = 'personal-agent-create-v1'

def runtime_capability(tenant, uid, revision):
    payload = {'t': tenant, 'u': uid, 'r': revision, 'exp': time.time()+360, 'purpose': PURPOSE}
    data = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    token = data+'.'+hmac.new(service_token().encode(), data.encode(), hashlib.sha256).hexdigest()
    return {'url': os.environ.get('PERSONAL_AGENT_CLI_URL', 'https://10.151.113.125:21190/console/api/personal-assistant/agent-cli'), 'token': token}

def verify(token):
    try:
        data, sig = token.rsplit('.', 1)
        if not hmac.compare_digest(sig, hmac.new(service_token().encode(), data.encode(), hashlib.sha256).hexdigest()): raise ValueError()
        scope = json.loads(base64.urlsafe_b64decode(data))
        if scope['purpose'] != PURPOSE or scope['exp'] < time.time(): raise ValueError()
        return scope
    except (ValueError, KeyError, TypeError):
        raise Forbidden('创建授权已失效，请重新发送需求') from None

def validate_spec(body):
    if not isinstance(body, dict) or set(body)-{'name','description','system_prompt'}: raise BadRequest('只允许名称、简介和提示词；不能指定账号、空间、共享或发布')
    for key, limit in [('name',100),('description',1000),('system_prompt',30000)]:
        if not isinstance(body.get(key,''),str) or len(body.get(key,''))>limit: raise BadRequest('字段类型或长度无效')
    if not body.get('name','').strip() or len(body.get('system_prompt','').strip())<20: raise BadRequest('请提供名称及完整的智能体提示词')
    return {k:body.get(k,'').strip() for k in ('name','description','system_prompt')}

def create_draft(scope, body):
    from services.app_service import AppService, CreateAppParams
    from services.agent.composer_service import AgentComposerService as Composer
    from services.entities.agent_entities import ComposerSavePayload
    from models.agent_config_entities import AgentSoulConfig
    from models.model import App
    spec = validate_spec(body)
    tenant, uid = scope['t'], scope['u']
    # An outer transaction keeps native create_app's internal commits atomic with configuration.
    with db.engine.begin() as conn, Session(bind=conn, join_transaction_mode='create_savepoint') as session:
        user = session.get(Account, uid)
        membership = session.scalar(select(TenantAccountJoin).where(TenantAccountJoin.tenant_id==tenant,TenantAccountJoin.account_id==uid))
        if not user or str(user.status)!='active' or not membership or str(membership.role) not in ('owner','admin','editor'): raise Forbidden('当前账号没有创建智能体的权限')
        state = read_state(session,tenant,uid)
        if state['revision']!=scope['r']: raise Forbidden('助手配置已变化，请重新发送需求')
        user.set_tenant_id_with_session(tenant,session=session)
        session.execute(text('SELECT pg_advisory_xact_lock(hashtextextended(:key,0))'), {'key':f'{tenant}:{uid}:agent:{spec["name"]}'})
        agent = session.scalar(select(Agent).where(Agent.tenant_id==tenant,Agent.created_by==uid,Agent.name==spec['name'],Agent.status==AgentStatus.ACTIVE))
        if agent and (str(agent.source)=='system' or session.scalar(text('SELECT 1 FROM rx_buddy_agents WHERE tenant_id=:t AND agent_id=:a AND active=true'),{'t':tenant,'a':agent.id})):
            from werkzeug.exceptions import Conflict
            raise Conflict('名称与企服智能体重复，请换一个名称')
        created = agent is None
        if created:
            prompt = '默认用简体中文解释、组织回答；教学例句、练习或用户要求的目标语言内容可保留原文。\n\n'+spec['system_prompt']
            soul_data = {'prompt':{'system_prompt':prompt}, 'config_note':'由个人助手 CLI 创建的私有草稿'}
            from core.model_manager import ModelManager
            from graphon.model_runtime.entities.model_entities import ModelType
            model = ModelManager.for_tenant(tenant_id=tenant).get_default_model_instance(tenant_id=tenant,model_type=ModelType.LLM)
            if model:
                provider = model.provider
                soul_data['model']={'plugin_id':'/'.join(provider.split('/')[:2]),'model_provider':provider,'model':model.model_name}
            soul = AgentSoulConfig.model_validate(soul_data)
            app = AppService().create_app(tenant, CreateAppParams(name=spec['name'],description=spec['description'],agent_role=spec['description'],mode='agent',icon_type='link',icon='/new-ui/raccoon-emoji-v1/028-planning.webp',icon_background='transparent'),user,session=session)
            agent = session.scalar(select(Agent).where(Agent.tenant_id==tenant,Agent.app_id==app.id))
            Composer.save_agent_composer(session=session,tenant_id=tenant,agent_id=agent.id,account_id=uid,payload=ComposerSavePayload(variant='agent_app',save_strategy='save_to_current_version',agent_soul=soul))
            app.enable_site=False;app.enable_api=False
            session.commit()
        from .governance import private_resource
        app=session.get(App,agent.app_id)
        result={'id':agent.id,'name':agent.name,'created':created,'published':bool(agent.active_config_is_published),'url':'/#agents/'+agent.id,'list_url':'/#agents/mine','api':{'supported':True,'publish_requires_approval':not private_resource(session,tenant,'agent',agent.id),'base_url':app.api_base_url if app else None,'endpoint':app.api_base_url.rstrip('/')+'/chat-messages' if app else None,
            'response_mode':'streaming','access_url':'/#agents/'+agent.id+'/access','authentication':'API Key'},'message':'已创建私有草稿，提示词已配置；请预览测试后按现有流程发布。' if created else '已有同名智能体，未重复创建，也未覆盖现有配置。'}
    return result

@console_ns.route('/personal-assistant/agent-cli')
class PersonalAgentCLI(Resource):
    def post(self):
        scope = verify(request.headers.get('Authorization','').removeprefix('Bearer '))
        return dispatch(scope, request.get_json(silent=True))


def revision(state):
    return hashlib.sha256(json.dumps({k: state.get(k) for k in ('agent_soul','draft','active_config_snapshot')}, sort_keys=True, default=str).encode()).hexdigest()


def authorized_user(session, scope):
    tenant, uid = scope['t'], scope['u']
    user = session.get(Account, uid)
    membership = session.scalar(select(TenantAccountJoin).where(TenantAccountJoin.tenant_id==tenant, TenantAccountJoin.account_id==uid))
    if not user or str(user.status)!='active' or not membership or str(membership.role) not in ('owner','admin','editor'):
        raise Forbidden('当前账号没有编辑智能体的权限')
    if read_state(session,tenant,uid)['revision']!=scope['r']:
        raise Forbidden('助手配置已变化，请重新发送需求')
    user.set_tenant_id_with_session(tenant,session=session)
    return user


def resources(session, tenant, user):
    from models.skill import Skill
    from models.dataset import Dataset
    from models.tools import MCPToolProvider
    from services.dataset_service import DatasetService
    from .visibility import can_read
    result = {'skills':[], 'knowledge':[], 'mcp':[], 'models':[]}
    from .personal import catalog
    result['models'] = catalog(session,tenant,user)['models']
    for row in session.scalars(select(Skill).where(Skill.tenant_id==tenant)):
        if row.latest_published_version_id and can_read(session,tenant,user.id,'skill',row):
            result['skills'].append({'id':row.id,'name':row.display_name,'description':row.description})
    for row in session.scalars(select(Dataset).where(Dataset.tenant_id==tenant)):
        try: DatasetService.check_dataset_permission(row,user,session)
        except Exception: continue
        result['knowledge'].append({'id':row.id,'name':row.name})
    for row in session.scalars(select(MCPToolProvider).where(MCPToolProvider.tenant_id==tenant)):
        if row.authed and can_read(session,tenant,user.id,'mcp',row):
            result['mcp'].append({'id':row.id,'name':row.name})
    return result


def view(session, agent, state):
    from models.model import App
    from .governance import private_resource
    needs_approval=not private_resource(session,agent.tenant_id,'agent',agent.id)
    soul = state['agent_soul']
    app = session.get(App,agent.app_id)
    return {'id':agent.id,'name':agent.name,'revision':revision(state),
        'description':agent.description,'model':soul.get('model'),
        'web':{'enabled':bool(app and app.enable_site and agent.active_config_snapshot_id), 'url':(app.site_with_session(session=session).app_base_url.rstrip('/')+'/agent/'+app.site_with_session(session=session).code) if app and app.enable_site and agent.active_config_snapshot_id and app.site_with_session(session=session) else None},
        'system_prompt':soul.get('prompt',{}).get('system_prompt',''),
        'skills':[{'name':x['name'],'file_id':x['file_id']} for x in soul.get('config_skills',[])],
        'knowledge':soul.get('knowledge',{}).get('sets',[]),
        'mcp':[{'provider_id':x.get('provider_id'),'tool_name':x.get('tool_name')} for x in soul.get('tools',{}).get('dify_tools',[]) if x.get('provider_type')=='mcp'],
        'url':'/#agents/'+agent.id,'draft_saved':True,
        'api':{'supported':True,'enabled':bool(app and app.enable_api and agent.active_config_snapshot_id),
            'base_url':app.api_base_url if app else None,'endpoint':app.api_base_url.rstrip('/')+'/chat-messages' if app else None,
            'response_mode':'streaming','access_url':'/#agents/'+agent.id+'/access','authentication':'API Key',
            'publish_requires_approval':needs_approval,'message':'Private 可直接发布及开启 Web/API；部门或 Public 共享需要审批。API Key 在访问页管理。'}}


def dispatch(scope, body):
    from uuid import UUID, uuid4
    from copy import deepcopy
    from werkzeug.exceptions import NotFound, Conflict
    from models.agent import AgentConfigDraft, AgentConfigDraftType
    from models.agent_config_entities import AgentSoulConfig
    from services.agent.composer_service import AgentComposerService as Composer
    from services.entities.agent_entities import ComposerSavePayload
    if not isinstance(body,dict): raise BadRequest('请求必须是 JSON 对象')
    if 'action' not in body: return create_draft(scope,body)  # legacy CLI
    action=body.get('action')
    allowed={'list':{'action'},'resources':{'action'},'get':{'action','id'},'update':{'action','id','revision','patch'},'publish':{'action','id','revision','external_access','note'},'status':{'action','id'}}
    if action not in allowed or set(body)-allowed[action]: raise BadRequest('不支持的操作或字段；请使用 publish 命令按可见范围执行发布')
    tenant,uid=scope['t'],scope['u']
    with db.engine.begin() as conn, Session(bind=conn,join_transaction_mode='create_savepoint') as session:
        user=authorized_user(session,scope)
        base=select(Agent).where(Agent.tenant_id==tenant,Agent.created_by==uid,Agent.scope=='roster',Agent.app_id.is_not(None),Agent.status==AgentStatus.ACTIVE)
        enterprise=list(session.scalars(text('SELECT agent_id FROM rx_buddy_agents WHERE tenant_id=:t AND active=true'),{'t':tenant}))
        base=base.where(Agent.source!='system')
        if enterprise: base=base.where(Agent.id.not_in(enterprise))
        if action=='list': return {'agents':[{'id':a.id,'name':a.name,'url':'/#agents/'+a.id} for a in session.scalars(base.order_by(Agent.name))]}
        if action=='resources': return resources(session,tenant,user)
        try: aid=str(UUID(body.get('id','')))
        except (ValueError,TypeError,AttributeError): raise BadRequest('智能体 ID 无效') from None
        if action=='publish': session.execute(text('SELECT tenant_id FROM rx_governance_settings WHERE tenant_id=:t FOR UPDATE'),{'t':tenant})
        agent=session.scalar(base.where(Agent.id==aid).with_for_update())
        if not agent: raise NotFound('智能体不存在或不属于当前账号')
        session.scalars(select(AgentConfigDraft).where(AgentConfigDraft.agent_id==aid,AgentConfigDraft.tenant_id==tenant,AgentConfigDraft.draft_type==AgentConfigDraftType.DRAFT).with_for_update()).all()
        state=Composer.load_agent_composer(session=session,tenant_id=tenant,agent_id=aid)
        if action=='get': return view(session,agent,state)
        if action=='status':
            from .governance import rows
            result=view(session,agent,state)
            result['releases']=rows(session,"SELECT id,state,note,created_at,decided_at FROM rx_releases WHERE tenant_id=:t AND applicant_id=:u AND kind='agent' AND resource_id=:id ORDER BY created_at DESC LIMIT 10",t=tenant,u=uid,id=aid)
            return result
        if body.get('revision')!=revision(state): raise Conflict('智能体已被修改，请重新读取后合并变更')
        if action=='publish':
            from .governance import submit_release
            from models.model import App
            shared=session.scalar(text("SELECT visibility FROM resource_visibility WHERE tenant_id=:t AND kind='agent' AND resource_id=:id"),{'t':tenant,'id':aid})
            departments=list(session.scalars(text("SELECT department_id FROM rx_resource_departments WHERE tenant_id=:t AND kind='agent' AND resource_id=:id"),{'t':tenant,'id':aid}))
            app=session.get(App,agent.app_id)
            req={'kind':'agent','resource_id':aid,'action':'publish','note':body.get('note') or '个人助手 CLI 提交当前草稿发布审批',
                'visibility':'workspace' if shared=='public' else 'department' if departments else 'private','department_ids':departments,
                'external_access':body.get('external_access',bool(app and (app.enable_site or app.enable_api)))}
            release=submit_release(session,tenant,user,req)
            session.commit()
            published_view=view(session,agent,Composer.load_agent_composer(session=session,tenant_id=tenant,agent_id=aid))
            return {**published_view,'id':aid,'release_id':release['id'],'state':release['state'],'published':release['state']=='approved','approval_required':release['summary'].get('approval_required',True),'external_access_requested':req['external_access'],'url':'/#agents/'+aid+'/access',
                'message':'Private 已直接发布，无需审批；Web/API 已按本次设置生效。' if release['state']=='approved' else '已提交发布申请，等待审批；尚未发布此草稿，未改变线上 API。'}
        patch=body.get('patch')
        if not isinstance(patch,dict) or not patch or set(patch)-{'system_prompt','skills','knowledge','mcp','model'}: raise BadRequest('仅支持提示词、模型、Skills、知识库和 MCP；其他配置保持原样')
        soul=deepcopy(state['agent_soul'])
        if 'system_prompt' in patch:
            prompt=patch['system_prompt']
            if not isinstance(prompt,str) or not 20<=len(prompt.strip())<=30000: raise BadRequest('请提供 20 至 30000 字的完整提示词')
            soul.setdefault('prompt',{})['system_prompt']=prompt.strip()
        available=resources(session,tenant,user) if set(patch)-{'system_prompt'} else {}
        if 'model' in patch:
            model=patch['model']
            if not isinstance(model,dict) or set(model)-{'id','provider'} or not any(m['id']==model.get('id') and m['provider']==model.get('provider') and m.get('available') for m in available['models']):
                raise BadRequest('模型不可用，请从 resources 返回的 models 中选择')
            soul['model']={'plugin_id':'/'.join(model['provider'].split('/')[:2]),'model_provider':model['provider'],'model':model['id']}
        for kind in ('skills','knowledge','mcp'):
            if kind not in patch: continue
            ops=patch[kind]
            if not isinstance(ops,dict) or set(ops)-{'add','remove'}: raise BadRequest('资源变更使用 add/remove ID 列表')
            for op in ('add','remove'):
                values=ops.get(op,[])
                if not isinstance(values,list) or len(values)>100 or any(not isinstance(v,str) for v in values): raise BadRequest('资源 ID 列表无效')
            add=set(ops.get('add',[])); remove=set(ops.get('remove',[]))
            if add & remove: raise BadRequest('同一资源不能同时添加和移除')
            visible={r['id'] for r in available[kind]}
            if not add.issubset(visible): raise Forbidden('资源不可用、未发布或未授权；请从 resources 返回的资源中选择')
            if kind=='skills':
                from models.skill import Skill, SkillVersion
                from services.skill_management_service import SkillManagementService
                refs=soul.setdefault('config_skills',[])
                # Removal accepts the bound archive ID from get, or an accessible library ID.
                remove_files=set(remove)
                for sid in remove & visible:
                    versions=session.scalars(select(SkillVersion).where(SkillVersion.skill_id==sid))
                    remove_files.update(v.archive_tool_file_id for v in versions)
                refs[:]=[r for r in refs if r['file_id'] not in remove_files]
                for sid in sorted(add):
                    skill=session.get(Skill,sid); v=session.get(SkillVersion,skill.latest_published_version_id)
                    name,_,description=SkillManagementService._published_skill_identity(skill,v)
                    existing=next((r for r in refs if r['name']==name),None)
                    if existing and existing['file_id']!=v.archive_tool_file_id: raise Conflict('已绑定同名不同版本技能，请先明确移除旧版本')
                    if not existing: refs.append({'name':name,'description':description,'file_kind':'tool_file','file_id':v.archive_tool_file_id})
            elif kind=='knowledge':
                sets=soul.setdefault('knowledge',{}).setdefault('sets',[])
                for group in sets: group['datasets']=[d for d in group['datasets'] if d['id'] not in remove]
                sets[:]=[g for g in sets if g['datasets']]
                bound={d['id'] for g in sets for d in g['datasets']}
                for did in sorted(add-bound):
                    item=next(x for x in available[kind] if x['id']==did)
                    sets.append({'id':str(uuid4()),'name':item['name'],'datasets':[item],
                        'query':{'mode':'generated_query'},'retrieval':{'mode':'multiple','top_k':4,'reranking_enable':False}})
            else:
                from models.tools import MCPToolProvider
                refs=soul.setdefault('tools',{}).setdefault('dify_tools',[])
                remove_providers=set(remove)
                for mid in remove & visible: remove_providers.add(session.get(MCPToolProvider,mid).server_identifier)
                refs[:]=[r for r in refs if not(r.get('provider_type')=='mcp' and r.get('provider_id') in remove_providers)]
                for mid in sorted(add):
                    m=session.get(MCPToolProvider,mid)
                    if not any(r.get('provider_type')=='mcp' and r.get('provider_id') in (mid,m.server_identifier) for r in refs):
                        refs.append({'provider_type':'mcp','provider_id':m.server_identifier,'tool_name':None,'enabled':True,'credential_type':'unauthorized'})
        try: config=AgentSoulConfig.model_validate(soul)
        except ValueError: raise BadRequest('配置格式无效，未保存任何变更') from None
        Composer.save_agent_composer(session=session,tenant_id=tenant,agent_id=aid,account_id=uid,payload=ComposerSavePayload(variant='agent_app',save_strategy='save_to_current_version',agent_soul=config))
        from .governance import audit
        audit(session,tenant,uid,'agent.cli.draft.update',aid,detail={'fields':sorted(patch)})
        session.commit()
        state=Composer.load_agent_composer(session=session,tenant_id=tenant,agent_id=aid)
        result=view(session,agent,state)
        result['message']='已保存草稿，线上版本和 API 开关保持不变。Private 发布无需审批；部门或 Public 共享发布须审批。'
        return result
