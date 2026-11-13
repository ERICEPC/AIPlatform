"""Scoped SalesBuddy management capability; never accepts tenant/owner/catalog from clients."""
import hashlib, json, secrets
from datetime import datetime, timezone
from flask import request
from flask_restx import Resource
from sqlalchemy import select, text, func
from sqlalchemy.orm import Session
from werkzeug.exceptions import BadRequest, Forbidden, NotFound, Conflict
from controllers.console import console_ns
from extensions.ext_database import db
from models.agent import Agent, AgentStatus
from core.agent.publish_visibility import agent_has_workflow_callable_active_snapshot as has_published
from models.model import App, ApiToken
from models.enums import ApiTokenType
from models.account import Account, TenantAccountJoin
from .personal import auth
from .governance import clean, audit, submit_release, private_resource
from .personal_agent_cli import revision, view, dispatch as personal_dispatch
from services.agent.composer_service import AgentComposerService as Composer

ACTIONS = {
 'list': {'action'}, 'get': {'action','id'},
 'create': {'action','name','description','system_prompt'},
 'update': {'action','id','revision','patch'},
 'publish': {'action','id','revision','note','visibility','department_ids','external_access'},
 'access': {'action','id','web','api'}, 'key-create': {'action','id'},
 'status': {'action','id'},
}

def credential(s):
 raw=request.headers.get('Authorization','')
 if not raw.startswith('Bearer sbm_'): raise Forbidden('需要 SalesBuddy 管理凭据')
 digest=hashlib.sha256(raw[7:].encode()).hexdigest()
 row=s.execute(text('SELECT * FROM rx_buddy_credentials WHERE token_hash=:h AND revoked=false AND expires_at>now() FOR SHARE'),{'h':digest}).mappings().first()
 if not row or row['buddy']!='sales':raise Forbidden('凭据无效、已撤销或已过期')
 user=s.get(Account,row['account_id'])
 member=s.scalar(select(TenantAccountJoin).where(TenantAccountJoin.tenant_id==row['tenant_id'],TenantAccountJoin.account_id==row['account_id']))
 if not user or str(user.status)!='active' or not member or str(member.role) not in ('owner','admin','editor'):raise Forbidden('授权账号已失效')
 user.set_tenant_id_with_session(row['tenant_id'],session=s)
 return dict(row),user

def target(s,t,aid):
 from uuid import UUID
 try: aid=str(UUID(str(aid)))
 except ValueError:raise BadRequest('无效智能体 ID') from None
 allowed=s.execute(text("SELECT agent_id FROM rx_buddy_agents WHERE tenant_id=:t AND buddy='sales' AND agent_id=:a AND active=true FOR UPDATE"),{'t':t,'a':aid}).scalar()
 if not allowed:raise NotFound('智能体不属于此 SalesBuddy 授权范围')
 agent=s.scalar(select(Agent).where(Agent.id==aid,Agent.tenant_id==t,Agent.status==AgentStatus.ACTIVE).with_for_update())
 if not agent:raise NotFound('智能体已停用')
 return agent

def describe(s,a):
 state=Composer.load_agent_composer(session=s,tenant_id=a.tenant_id,agent_id=a.id)
 result=view(s,a,state);ap=s.get(App,a.app_id)
 site=ap.site_with_session(session=s)
 result.update(description=a.description,published=has_published(session=s,agent=a),has_unpublished_changes=not a.active_config_is_published,web_enabled=bool(ap.enable_site),api_enabled=bool(ap.enable_api),api_base_url=ap.api_base_url,web_url=(f'{site.app_base_url.rstrip("/")}/agent/{site.code}' if site and ap.enable_site else None))
 return result

@console_ns.route('/enterprise/salesbuddy/agent-cli')
class SalesBuddyCLI(Resource):
 def post(self):
  b=request.get_json(silent=True)
  if not isinstance(b,dict) or b.get('action') not in ACTIONS or set(b)-ACTIONS.get(b.get('action'),set()):raise BadRequest('不支持的操作或字段')
  action=b['action']
  with db.engine.begin() as conn,Session(bind=conn,join_transaction_mode='create_savepoint') as s:
   cred,user=credential(s);t=cred['tenant_id'];uid=user.id
   s.execute(text('SELECT pg_advisory_xact_lock(hashtextextended(:k,0))'),{'k':t+':salesbuddy-cli'})
   if action=='list':
    entries=s.execute(text("SELECT a.id,a.name,a.description,a.active_config_is_published AS published FROM agents a JOIN rx_buddy_agents b ON b.agent_id=CAST(a.id AS text) AND b.tenant_id=CAST(a.tenant_id AS text) WHERE b.tenant_id=:t AND b.buddy='sales' AND b.active=true AND a.status='active' ORDER BY a.created_at DESC"),{'t':t}).mappings()
    return {'scope':'enterprise/salesbuddy','agents':clean([dict(x) for x in entries])}
   if action=='create':
    from .personal_agent_cli import validate_spec
    from services.app_service import AppService,CreateAppParams
    from services.entities.agent_entities import ComposerSavePayload
    from models.agent_config_entities import AgentSoulConfig
    from core.model_manager import ModelManager
    from graphon.model_runtime.entities.model_entities import ModelType
    spec=validate_spec({k:v for k,v in b.items() if k!='action'})
    existing=s.execute(text("SELECT a.id FROM agents a JOIN rx_buddy_agents b ON CAST(a.id AS text)=b.agent_id WHERE b.tenant_id=:t AND b.buddy='sales' AND b.active=true AND a.status='active' AND a.name=:n"),{'t':t,'n':spec['name']}).scalar()
    if existing:raise Conflict('SalesBuddy 中已有同名智能体，请读取后修改')
    model=ModelManager.for_tenant(tenant_id=t).get_default_model_instance(tenant_id=t,model_type=ModelType.LLM)
    if not model:raise Conflict('当前空间未配置默认模型')
    soul=AgentSoulConfig.model_validate({'prompt':{'system_prompt':spec['system_prompt']},'model':{'plugin_id':'/'.join(model.provider.split('/')[:2]),'model_provider':model.provider,'model':model.model_name},'config_note':'SalesBuddy 专属 CLI 创建'})
    ap=AppService().create_app(t,CreateAppParams(name=spec['name'],description=spec['description'],agent_role=spec['description'],mode='agent',icon_type='link',icon='/new-ui/raccoon-emoji-v1/007-sales.webp',icon_background='transparent'),user,session=s)
    a=s.scalar(select(Agent).where(Agent.tenant_id==t,Agent.app_id==ap.id))
    Composer.save_agent_composer(session=s,tenant_id=t,agent_id=a.id,account_id=uid,payload=ComposerSavePayload(variant='agent_app',save_strategy='save_to_current_version',agent_soul=soul))
    ap.enable_api=ap.enable_site=False
    s.execute(text("INSERT INTO rx_buddy_agents(tenant_id,buddy,agent_id) VALUES(:t,'sales',:a)"),{'t':t,'a':a.id})
    audit(s,t,uid,'salesbuddy.cli.create',a.id,detail={'credential_id':cred['id']})
    s.commit();return describe(s,a)
   a=target(s,t,b.get('id'))
   if a.created_by!=uid:raise Forbidden('资源所有者已变更，需管理员重新授权')
   if action in ('get','status'):
    result=describe(s,a)
    if action=='status':result['releases']=clean([dict(x) for x in s.execute(text("SELECT id,state,note,created_at FROM rx_releases WHERE tenant_id=:t AND resource_id=:a ORDER BY created_at DESC LIMIT 10"),{'t':t,'a':a.id}).mappings()])
    return result
   if action=='update':
    if s.execute(text("SELECT 1 FROM rx_releases WHERE tenant_id=:t AND resource_id=:a AND state='pending'"),{'t':t,'a':a.id}).scalar():raise Conflict('当前有待审批发布，禁止修改草稿')
    # Native patch validation and revision conflict protection; no arbitrary config/tenant injection.
    from .personal import read_state
    scope={'t':t,'u':uid,'r':read_state(s,t,uid)['revision']}
    # Release this connection's resource lock before native transaction; scope mapping is immutable.
    s.commit();conn.commit()
    return personal_dispatch(scope,b)
   ap=s.get(App,a.app_id)
   pending=s.execute(text("SELECT 1 FROM rx_releases WHERE tenant_id=:t AND resource_id=:a AND state='pending'"),{'t':t,'a':a.id}).scalar()
   if action=='publish':
    state=Composer.load_agent_composer(session=s,tenant_id=t,agent_id=a.id)
    if b.get('revision')!=revision(state):raise Conflict('草稿已修改，请重新 get 后提交')
    if 'external_access' in b and type(b['external_access']) is not bool:raise BadRequest('external_access 必须是布尔值')
    release=submit_release(s,t,user,{'kind':'agent','resource_id':a.id,'action':'publish','note':b.get('note','SalesBuddy CLI 发布'),'visibility':b.get('visibility','private'),'department_ids':b.get('department_ids',[]),'external_access':b.get('external_access',False)})
    audit(s,t,uid,'salesbuddy.cli.publish',a.id,detail={'credential_id':cred['id'],'release_id':release['id']})
    s.commit();return {'id':a.id,'release_id':release['id'],'state':release['state'],'approval_required':release['state']=='pending'}
   if pending:raise Conflict('当前有待审批发布，请等待审批完成')
   if not has_published(session=s,agent=a):raise Conflict('请先发布智能体')
   if action=='access':
    if not any(k in b for k in ('web','api')) or any(type(b[k]) is not bool for k in ('web','api') if k in b):raise BadRequest('web/api 必须是布尔值')
    if not private_resource(s,t,'agent',a.id) and any(b.get(k) for k in ('web','api')):
     last=s.execute(text("SELECT summary FROM rx_releases WHERE tenant_id=:t AND resource_id=:a AND action='publish' AND state='approved' ORDER BY decided_at DESC LIMIT 1"),{'t':t,'a':a.id}).scalar()
     if not last or not last.get('external_access'):raise Forbidden('共享版本尚未审批开放 Web/API，请先提交发布申请')
    if 'web' in b:ap.enable_site=b['web']
    if 'api' in b:ap.enable_api=b['api']
    audit(s,t,uid,'salesbuddy.cli.access',a.id,detail={'credential_id':cred['id'],'web':ap.enable_site,'api':ap.enable_api})
    s.commit();return describe(s,a)
   if action=='key-create':
    if not ap.enable_api:raise Conflict('请先开启 API')
    count=s.scalar(select(func.count(ApiToken.id)).where(ApiToken.app_id==ap.id,ApiToken.type==ApiTokenType.APP))
    if count>=10:raise Conflict('此智能体 API Key 已达到 10 个上限')
    key=ApiToken(app_id=ap.id,tenant_id=t,type=ApiTokenType.APP,token=ApiToken.generate_api_key('app-',24,session=s))
    s.add(key);s.flush()
    audit(s,t,uid,'salesbuddy.cli.key.create',a.id,detail={'credential_id':cred['id'],'key_id':key.id})
    s.commit();return {'id':key.id,'api_key':key.token,'api_base_url':ap.api_base_url,'agent_id':a.id}

@console_ns.route('/enterprise/salesbuddy/catalog')
class SalesBuddyCatalog(Resource):
 @auth
 def get(self,s,tenant_id,current_user):
  from .visibility import can_read
  ids=list(s.execute(text("SELECT agent_id FROM rx_buddy_agents WHERE tenant_id=:t AND buddy='sales' AND active=true"),{'t':tenant_id}).scalars())
  return {'ids':[a.id for a in s.scalars(select(Agent).where(Agent.tenant_id==tenant_id,Agent.id.in_(ids),Agent.status==AgentStatus.ACTIVE)) if can_read(s,tenant_id,current_user.id,'agent',a)]}
