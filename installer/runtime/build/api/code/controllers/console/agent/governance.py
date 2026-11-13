"""Workspace governance. All authority is resolved from server membership and grants.
Existing published snapshots remain active; new releases are transactional approvals.
"""
import logging
import hashlib
import json
from uuid import UUID, uuid4
from contextlib import contextmanager
from flask import g, has_request_context, request
from flask_restx import Resource
from sqlalchemy import event, inspect, select, text
from sqlalchemy.orm import Session
from werkzeug.exceptions import BadRequest, Conflict, Forbidden, NotFound
from controllers.console import bp, console_ns
from extensions.ext_database import db
from models.account import Account, TenantAccountJoin
from models.agent import Agent, AgentConfigDraft, AgentConfigSnapshot
from models.model import App
from models.skill import Skill, SkillDraftFile
from models.tools import MCPToolProvider
from .personal import auth

PERMISSIONS = {'org.members': '查看部门与成员', 'release.approve': '审批发布', 'audit.view': '查看审计', 'apps.view': '查看应用接入', 'ops.view': '查看运营数据'}

def rows(s, sql, **p):
    return [clean(dict(r)) for r in s.execute(text(sql), p).mappings()]

def one(s, sql, **p):
    return next(iter(rows(s, sql, **p)), None)

def body():
    b=request.get_json(silent=True)
    if not isinstance(b,dict): raise BadRequest('请提交有效的 JSON 对象')
    return b

def ident(v):
    try: return str(UUID(str(v)))
    except (ValueError,TypeError): raise BadRequest('无效标识') from None

def label(v, limit=100):
    if not isinstance(v,str) or not v.strip() or len(v.strip())>limit: raise BadRequest('名称或说明不能为空，且不能超出长度限制')
    return v.strip()

def ids(v):
    if not isinstance(v,list) or len(v)>100: raise BadRequest('请选择有效的部门列表')
    return sorted(set(ident(x) for x in v))

# Compatibility export: existing callers keep using governance.clean.
from services.platform_common.serialization import clean

def enabled(s,t):
    return bool(s.execute(text('SELECT enabled FROM rx_governance_settings WHERE tenant_id=:t'),{'t':t}).scalar())

def audit(s,t,u,action,obj='',dept=None,result='success',detail=None):
    s.execute(text('INSERT INTO rx_governance_audit(tenant_id,actor_id,action,object_id,department_id,result,detail) VALUES(:t,:u,:a,:o,:d,:r,CAST(:j AS jsonb))'),dict(t=t,u=u,a=action,o=str(obj),d=dept,r=result,j=json.dumps(detail or {},ensure_ascii=False)))

def deny(t,u,message):
    # Independent transaction: denied attempts survive the request rollback.
    with Session(db.engine) as s:
        audit(s,t,u,'permission.denied',result='denied',detail={'reason':message});s.commit()
    raise Forbidden(message)

def member(s,t,u):
    found=s.scalar(select(Account).join(TenantAccountJoin,TenantAccountJoin.account_id==Account.id).where(TenantAccountJoin.tenant_id==t,Account.id==u))
    if not found or str(found.status) not in ('active','pending'): raise BadRequest('该成员不在当前工作空间或已停用')
    return found

def dept(s,t,d):
    r=one(s,'SELECT * FROM rx_departments WHERE tenant_id=:t AND id=:d',t=t,d=d)
    if not r: raise NotFound('部门不存在')
    return r

def expand(s,t,seeds):
    from services.platform_permissions.repository import PermissionsRepository
    from services.platform_permissions.service import expand_scope
    return expand_scope(PermissionsRepository(s),t,seeds)

def membership(s,t,u):
    return [r['department_id'] for r in rows(s,'SELECT department_id FROM rx_department_members WHERE tenant_id=:t AND account_id=:u',t=t,u=u)]

def permissions(s,t,u):
    from services.platform_permissions.repository import PermissionsRepository
    from services.platform_permissions.service import read_permissions
    return read_permissions(PermissionsRepository(s),t,u,PERMISSIONS)

def require(s,t,u,permission=None,super_only=False):
    if request.method not in ('GET','HEAD','OPTIONS'):
        s.execute(text('SELECT tenant_id FROM rx_governance_settings WHERE tenant_id=:t FOR UPDATE'),{'t':t})
    p=permissions(s,t,u)
    if p['role']=='super_admin':return p
    if super_only or p['role']!='admin' or (permission and permission not in p['permissions']):deny(t,u,'你没有此管理权限')
    return p

def serialize_release(r):return clean(r)

def scope_clause(p,column='department_id'):
    return ('TRUE',{}) if p['role']=='super_admin' else (f'{column} IN (SELECT jsonb_array_elements_text(CAST(:scopes AS jsonb)))',{'scopes':json.dumps(p['scope_ids'])})

@console_ns.route('/account/permissions')
class Permissions(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        p=permissions(s,tenant_id,current_user.id)
        mine=membership(s,tenant_id,current_user.id)
        departments=rows(s,'SELECT id,name,parent_id FROM rx_departments WHERE tenant_id=:t ORDER BY name',t=tenant_id)
        return {**p,'enabled':enabled(s,tenant_id),'account_id':current_user.id,'tenant_id':tenant_id,
                'member_department_ids':mine,'departments':departments,
                'scopes':[{'type':'department','id':d['id'],'name':d['name']} for d in departments if d['id'] in p['department_ids']]}

@console_ns.route('/admin/org')
class Organization(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        p=require(s,tenant_id,current_user.id,'org.members')
        from services.platform_organization.repository import OrganizationRepository
        from services.platform_organization.service import organization_directory
        return organization_directory(OrganizationRepository(s),tenant_id,p)

@console_ns.route('/admin/departments')
class Departments(Resource):
    @auth
    def post(self,s,tenant_id,current_user):
        require(s,tenant_id,current_user.id,super_only=True);b=body();name=label(b.get('name'))
        parent=ident(b['parent_id']) if b.get('parent_id') else None
        if parent:dept(s,tenant_id,parent)
        did=str(uuid4());s.execute(text('INSERT INTO rx_departments(id,tenant_id,name,parent_id) VALUES(:id,:t,:n,:p)'),dict(id=did,t=tenant_id,n=name,p=parent))
        audit(s,tenant_id,current_user.id,'department.create',did,did,detail={'name':name})
        return {'id':did,'name':name,'parent_id':parent}

@console_ns.route('/admin/departments/<string:did>')
class Department(Resource):
    @auth
    def put(self,s,tenant_id,current_user,did):
        require(s,tenant_id,current_user.id,super_only=True);did=ident(did);dept(s,tenant_id,did);b=body()
        s.execute(text('SELECT tenant_id FROM rx_governance_settings WHERE tenant_id=:t FOR UPDATE'),{'t':tenant_id})
        parent=ident(b['parent_id']) if b.get('parent_id') else None
        if parent:
            dept(s,tenant_id,parent)
            if parent in expand(s,tenant_id,[did]):raise BadRequest('不能把部门放到自身或下级部门下面')
        name=label(b.get('name'));s.execute(text('UPDATE rx_departments SET name=:n,parent_id=:p WHERE tenant_id=:t AND id=:d'),dict(n=name,p=parent,t=tenant_id,d=did))
        audit(s,tenant_id,current_user.id,'department.update',did,did)
        return {'id':did,'name':name,'parent_id':parent}
    @auth
    def delete(self,s,tenant_id,current_user,did):
        require(s,tenant_id,current_user.id,super_only=True);did=ident(did);dept(s,tenant_id,did)
        for table,col in [('rx_departments','parent_id'),('rx_department_members','department_id'),('rx_resource_departments','department_id'),('rx_releases','department_id'),('rx_integrations','department_id')]:
            if s.execute(text(f'SELECT 1 FROM {table} WHERE tenant_id=:t AND {col}=:d LIMIT 1'),dict(t=tenant_id,d=did)).scalar():raise Conflict('部门仍有成员、下级或授权/审批引用，不能删除')
        if s.execute(text('SELECT 1 FROM rx_admin_assignments WHERE tenant_id=:t AND department_ids @> CAST(:d AS jsonb)'),dict(t=tenant_id,d=json.dumps([did]))).scalar():raise Conflict('部门仍被管理员范围引用')
        if s.execute(text('SELECT 1 FROM rx_releases WHERE tenant_id=:t AND department_ids @> CAST(:d AS jsonb)'),dict(t=tenant_id,d=json.dumps([did]))).scalar():raise Conflict('部门仍被发布申请引用')
        s.execute(text('DELETE FROM rx_departments WHERE tenant_id=:t AND id=:d'),dict(t=tenant_id,d=did));audit(s,tenant_id,current_user.id,'department.delete',did,did)
        return {'result':'success'}

@console_ns.route('/admin/members/<string:uid>/departments')
class MemberDepartments(Resource):
    @auth
    def put(self,s,tenant_id,current_user,uid):
        require(s,tenant_id,current_user.id,super_only=True);uid=ident(uid);member(s,tenant_id,uid);values=ids(body().get('department_ids'))
        for d in values:dept(s,tenant_id,d)
        s.execute(text('DELETE FROM rx_department_members WHERE tenant_id=:t AND account_id=:u'),dict(t=tenant_id,u=uid))
        for d in values:s.execute(text('INSERT INTO rx_department_members(tenant_id,account_id,department_id) VALUES(:t,:u,:d)'),dict(t=tenant_id,u=uid,d=d))
        audit(s,tenant_id,current_user.id,'member.departments',uid,detail={'department_ids':values})
        return {'result':'success','department_ids':values}

@console_ns.route('/admin/roles')
class Roles(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        require(s,tenant_id,current_user.id)
        return {'data':rows(s,'SELECT * FROM rx_admin_roles WHERE tenant_id=:t ORDER BY id',t=tenant_id),'permission_items':[{'id':k,'name':v} for k,v in PERMISSIONS.items()]}
    @auth
    def post(self,s,tenant_id,current_user):
        require(s,tenant_id,current_user.id,super_only=True);b=body();values=b.get('permissions')
        if not isinstance(values,list) or not values or any(v not in PERMISSIONS for v in values):raise BadRequest('请选择有效的管理权限')
        rid=str(uuid4());s.execute(text('INSERT INTO rx_admin_roles(tenant_id,id,name,permissions) VALUES(:t,:i,:n,CAST(:p AS jsonb))'),dict(t=tenant_id,i=rid,n=label(b.get('name')),p=json.dumps(sorted(set(values)))))
        audit(s,tenant_id,current_user.id,'role.create',rid);return {'id':rid}

@console_ns.route('/admin/admins')
class Admins(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        require(s,tenant_id,current_user.id,super_only=True)
        return {'data':clean(rows(s,'SELECT g.*,a.name,a.email,r.name AS role_name FROM rx_admin_assignments g JOIN accounts a ON CAST(a.id AS text)=g.account_id JOIN rx_admin_roles r ON r.tenant_id=g.tenant_id AND r.id=g.role_id WHERE g.tenant_id=:t ORDER BY a.name',t=tenant_id))}
    @auth
    def post(self,s,tenant_id,current_user):
        require(s,tenant_id,current_user.id,super_only=True);b=body();uid=ident(b.get('member_id'));member(s,tenant_id,uid)
        s.execute(text('SELECT tenant_id FROM rx_governance_settings WHERE tenant_id=:t FOR UPDATE'),{'t':tenant_id})
        role=label(b.get('role_id')); r=one(s,'SELECT * FROM rx_admin_roles WHERE tenant_id=:t AND id=:r',t=tenant_id,r=role)
        if not r:raise BadRequest('请选择有效的管理员角色')
        scopes=ids(b.get('department_ids',[]))
        if role!='role-super' and not scopes:raise BadRequest('普通管理员必须选择部门管理范围')
        if role=='role-super':scopes=[]
        for d in scopes:dept(s,tenant_id,d)
        protect_last_super(s,tenant_id,uid,role)
        s.execute(text('INSERT INTO rx_admin_assignments(tenant_id,account_id,role_id,department_ids,granted_by) VALUES(:t,:u,:r,CAST(:d AS jsonb),:g) ON CONFLICT(tenant_id,account_id) DO UPDATE SET role_id=:r,department_ids=CAST(:d AS jsonb),granted_by=:g,updated_at=now()'),dict(t=tenant_id,u=uid,r=role,d=json.dumps(scopes),g=current_user.id))
        audit(s,tenant_id,current_user.id,'admin.assign',uid,detail={'role_id':role,'department_ids':scopes});return {'result':'success'}

def protect_last_super(s,t,u,new_role):
    old=one(s,'SELECT role_id FROM rx_admin_assignments WHERE tenant_id=:t AND account_id=:u',t=t,u=u)
    if old and old['role_id']=='role-super' and new_role!='role-super':
        count=s.execute(text("SELECT count(*) FROM rx_admin_assignments WHERE tenant_id=:t AND role_id='role-super'"),{'t':t}).scalar()
        if count<=1:raise Conflict('至少保留一位超级管理员')

@console_ns.route('/admin/admins/<string:uid>')
class Admin(Resource):
    @auth
    def delete(self,s,tenant_id,current_user,uid):
        require(s,tenant_id,current_user.id,super_only=True);uid=ident(uid)
        s.execute(text('SELECT tenant_id FROM rx_governance_settings WHERE tenant_id=:t FOR UPDATE'),{'t':tenant_id})
        protect_last_super(s,tenant_id,uid,None)
        s.execute(text('DELETE FROM rx_admin_assignments WHERE tenant_id=:t AND account_id=:u'),dict(t=tenant_id,u=uid))
        audit(s,tenant_id,current_user.id,'admin.revoke',uid);return {'result':'success'}

@contextmanager
def as_owner(s,uid):
    previous=s.info.get('governance_execution_owner')
    s.info['governance_execution_owner']=uid
    g.pop('_resource_acl_cache_key',None)
    try:yield
    finally:
        if previous is None:s.info.pop('governance_execution_owner',None)
        else:s.info['governance_execution_owner']=previous
        g.pop('_resource_acl_cache_key',None)

def resource(s,t,kind,rid,lock=False):
    from .visibility import MODELS
    if kind not in MODELS:raise BadRequest('资源类型无效')
    model,owner=MODELS[kind]
    q=select(model).where(model.tenant_id==t,model.id==ident(rid)).execution_options(resource_acl_internal=True)
    if lock:q=q.with_for_update()
    r=s.scalar(q)
    if not r:raise NotFound('资源不存在')
    return r,getattr(r,owner)

def fingerprint(s,t,kind,r):
    name=getattr(r,'display_name',None) or r.name
    summary={'name':name,'kind':kind}
    data={'name':name,'description':getattr(r,'description',''),'active':getattr(r,'active_config_snapshot_id',None)}
    if kind=='agent':
        d=s.scalar(select(AgentConfigDraft).where(AgentConfigDraft.tenant_id==t,AgentConfigDraft.agent_id==r.id,AgentConfigDraft.draft_type=='draft'))
        data['draft']=d.config_snapshot_dict if d else None;data['home']=d.home_snapshot_id if d else None
        config=data['draft'] or {}
        summary.update(prompt=(config.get('prompt') or {}).get('system_prompt',''),model=(config.get('model') or {}).get('model'),home_snapshot_id=data['home'])
        summary['tools']=[x.get('provider_id') for x in (config.get('tools') or {}).get('dify_tools',[])]
        app=s.scalar(select(App).where(App.id==r.app_id,App.tenant_id==t).execution_options(resource_acl_internal=True)) if r.app_id else None
        summary['external_access']=bool(r.active_config_is_published and app and (app.enable_site or app.enable_api))
    elif kind=='skill':
        files=list(s.scalars(select(SkillDraftFile).where(SkillDraftFile.skill_id==r.id).order_by(SkillDraftFile.path)))
        data['files']=[{k:getattr(f,k) for k in ('path','hash','content_text','tool_file_id','storage')} for f in files]
        summary['files']=[f.path for f in files];summary['instructions']=next((f.content_text for f in files if f.path=='SKILL.md'),'')
    else:
        # Include protected connection configuration in the digest, not in review output.
        data['connection']={c.key:getattr(r,c.key) for c in inspect(r).mapper.column_attrs if c.key not in ('updated_at','created_at')}
        summary['authorized']=bool(getattr(r,'authed',False))
    digest=hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False,default=str).encode()).hexdigest()
    return digest,summary

@console_ns.route('/releases')
class Releases(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        return {'data':clean(rows(s,'SELECT * FROM rx_releases WHERE tenant_id=:t AND applicant_id=:u ORDER BY created_at DESC LIMIT 100',t=tenant_id,u=current_user.id))}
    @auth
    def post(self,s,tenant_id,current_user):
        return submit_release(s,tenant_id,current_user,body())


def submit_release(s, tenant_id, current_user, b):
    s.execute(text('SELECT tenant_id FROM rx_governance_settings WHERE tenant_id=:t FOR UPDATE'),{'t':tenant_id})
    if not enabled(s,tenant_id):raise Conflict('当前工作空间尚未启用发布治理')
    kind=b.get('kind');r,owner=resource(s,tenant_id,kind,b.get('resource_id'),True)
    if owner!=current_user.id:deny(tenant_id,current_user.id,'仅资源创建者可以提交发布或共享申请')
    action=b.get('action','publish')
    if action not in ('publish','share') or (action=='publish' and kind=='mcp'):raise BadRequest('该资源不支持此发布动作')
    visibility=b.get('visibility','private')
    if visibility not in ('private','department','workspace'):raise BadRequest('请选择仅自己、部门内或工作空间内')
    targets=ids(b.get('department_ids',[])) if visibility=='department' else []
    if visibility=='department' and not targets:raise BadRequest('请选择共享部门')
    for d in targets:dept(s,tenant_id,d)
    did=ident(b['department_id']) if visibility!='private' and b.get('department_id') else None
    if did:
        dept(s,tenant_id,did)
        if did not in membership(s,tenant_id,current_user.id) and permissions(s,tenant_id,current_user.id)['role']!='super_admin':deny(tenant_id,current_user.id,'只能向本人所属部门提交审批')
    digest,summary=fingerprint(s,tenant_id,kind,r)
    if action=='publish' and kind=='agent' and not summary.get('model'):raise BadRequest('请先为 Agent 配置模型并保存草稿')
    if 'external_access' in b and not isinstance(b['external_access'],bool):raise BadRequest('对外访问设置无效')
    if kind=='agent' and action=='publish':summary['external_access']=b.get('external_access',summary['external_access'])
    summary['approval_required']=visibility!='private'
    pending=one(s,"SELECT id FROM rx_releases WHERE tenant_id=:t AND kind=:k AND resource_id=:r AND state='pending' FOR UPDATE",t=tenant_id,k=kind,r=r.id)
    if pending:
        if visibility!='private':raise Conflict('该资源已有待审批申请，请先撤回或等待处理')
        s.execute(text("UPDATE rx_releases SET state='withdrawn',decided_at=now(),comment='改为 Private 直接生效，原申请已撤回' WHERE id=:id"),{'id':pending['id']})
        audit(s,tenant_id,current_user.id,'release.withdraw',pending['id'],detail={'reason':'private_release'})
    rid=str(uuid4());note=label(b.get('note') or '申请发布当前配置',2000)
    s.execute(text('INSERT INTO rx_releases(id,tenant_id,applicant_id,kind,resource_id,resource_name,action,department_id,visibility,department_ids,fingerprint,summary,note) VALUES(:id,:t,:u,:k,:r,:n,:a,:d,:v,CAST(:ds AS jsonb),:f,CAST(:j AS jsonb),:note)'),dict(id=rid,t=tenant_id,u=owner,k=kind,r=r.id,n=summary['name'],a=action,d=did,v=visibility,ds=json.dumps(targets),f=digest,j=json.dumps(summary,ensure_ascii=False),note=note))
    if visibility=='private':
        with as_owner(s,owner):
            result=execute_release(s,tenant_id,owner,r,kind,action,note,summary,visibility,targets)
        s.execute(text("UPDATE rx_releases SET state='approved',decided_at=now(),comment='Private 直接生效，无需审批',result=CAST(:j AS jsonb) WHERE id=:id"),{'id':rid,'j':json.dumps({**result,'approval_required':False})})
        audit(s,tenant_id,current_user.id,'release.private',rid,detail={'kind':kind,'action':action,'external_access':summary.get('external_access',False)})
    else:
        audit(s,tenant_id,current_user.id,'release.submit',rid,did,detail={'kind':kind,'action':action,'visibility':visibility})
    return clean(one(s,'SELECT * FROM rx_releases WHERE id=:id',id=rid))

@console_ns.route('/releases/<string:rid>/withdraw')
class Withdraw(Resource):
    @auth
    def post(self,s,tenant_id,current_user,rid):
        r=one(s,'SELECT * FROM rx_releases WHERE tenant_id=:t AND id=:id FOR UPDATE',t=tenant_id,id=ident(rid))
        if not r:raise NotFound('申请不存在')
        if r['applicant_id']!=current_user.id:deny(tenant_id,current_user.id,'只能撤回自己的申请')
        if r['state']!='pending':raise Conflict('申请已经处理，不能再次撤回')
        s.execute(text("UPDATE rx_releases SET state='withdrawn',decided_at=now() WHERE id=:id"),{'id':r['id']})
        audit(s,tenant_id,current_user.id,'release.withdraw',r['id'],r['department_id']);return {'result':'success'}

@console_ns.route('/admin/approvals')
class Approvals(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        p=require(s,tenant_id,current_user.id,'release.approve');clause,params=scope_clause(p)
        state=request.args.get('state','pending')
        condition="AND state='pending'" if state=='pending' else "AND state!='pending'" if state=='done' else ''
        return {'data':clean(rows(s,f'SELECT * FROM rx_releases WHERE tenant_id=:t AND COALESCE((summary->>$$approval_required$$)::boolean,true) AND {clause} {condition} ORDER BY created_at DESC LIMIT 100',t=tenant_id,**params))}

@console_ns.route('/admin/approvals/<string:rid>/decision')
class Decision(Resource):
    @auth
    def post(self,s,tenant_id,current_user,rid):
        p=require(s,tenant_id,current_user.id,'release.approve');b=body();decision=b.get('decision')
        if decision not in ('approve','return','reject'):raise BadRequest('无效审批动作')
        comment=label(b.get('comment'),2000)
        r=one(s,'SELECT * FROM rx_releases WHERE tenant_id=:t AND id=:id FOR UPDATE',t=tenant_id,id=ident(rid))
        if not r:raise NotFound('申请不存在')
        if p['role']!='super_admin':
            if r['department_id'] not in p['scope_ids']:deny(tenant_id,current_user.id,'申请不在你的管理范围内')
            if r['applicant_id']==current_user.id:deny(tenant_id,current_user.id,'不能审批自己的发布申请，请交由其他管理员处理')
            if decision=='approve' and (r['visibility']=='workspace' or (r['action']=='publish' and r['summary'].get('external_access')) or not set(r['department_ids']).issubset(p['scope_ids'])):deny(tenant_id,current_user.id,'超出部门范围或涉及对外访问的申请需要超级管理员审批')
        if r['state']!='pending':raise Conflict('申请已处理，不能重复审批')
        state={'return':'returned','reject':'rejected'}.get(decision,'approved');result={}
        if decision=='approve':
            # Lock the parent row, then re-read the content under the applicant's
            # execution identity. Private memory is never queried by this path.
            obj,owner=resource(s,tenant_id,r['kind'],r['resource_id'],True)
            if owner!=r['applicant_id']:raise Conflict('资源归属已变化，请重新提交')
            member(s,tenant_id,owner)
            if r['department_id'] and r['department_id'] not in membership(s,tenant_id,owner) and permissions(s,tenant_id,owner)['role']!='super_admin':raise Conflict('申请人的部门归属已变化，请撤回后重新提交')
            for target in r['department_ids']:dept(s,tenant_id,target)
            with as_owner(s,owner):
                digest,_=fingerprint(s,tenant_id,r['kind'],obj)
                if digest!=r['fingerprint']:
                    state='stale';result={'message':'提交后的配置已变化，请重新提交审批'}
                else:
                    try:
                        with s.begin_nested():
                            result=execute_release(s,tenant_id,owner,obj,r['kind'],r['action'],r['note'],r['summary'],r['visibility'],r['department_ids'])
                    except Exception:
                        logging.getLogger(__name__).exception('Approved release execution failed: %s',r['id'])
                        state='failed';result={'message':'执行发布失败，原发布版本保持不变。请检查配置后重新提交。'}
                    finally:s.info.pop('governance_approved_resource',None)
        s.execute(text('UPDATE rx_releases SET state=:state,reviewer_id=:u,comment=:c,result=CAST(:j AS jsonb),decided_at=now() WHERE id=:id'),dict(state=state,u=current_user.id,c=comment,j=json.dumps(result),id=r['id']))
        audit(s,tenant_id,current_user.id,'release.'+decision,r['id'],r['department_id'],result='failed' if state in ('failed','stale') else 'success',detail={'state':state})
        return clean(one(s,'SELECT * FROM rx_releases WHERE id=:id',id=r['id']))

def execute_release(s,tenant_id,owner,obj,kind,action,note,summary,visibility,departments):
    previous=s.info.get('governance_approved_resource')
    s.info['governance_approved_resource']=(kind,obj.id)
    try:
        result={}
        if action=='publish' and kind=='agent':
            from services.agent.composer_service import AgentComposerService
            published=AgentComposerService.publish_agent_app_draft(session=s,tenant_id=tenant_id,agent_id=obj.id,account_id=owner,version_note=note)
            result={'snapshot_id':published['active_config_snapshot_id']}
            a=s.scalar(select(App).where(App.id==obj.app_id,App.tenant_id==tenant_id))
            a.enable_site=a.enable_api=bool(summary.get('external_access'))
        elif action=='publish' and kind=='skill':
            from services.skill_management_service import SkillManagementService,SkillPublishPayload
            SkillManagementService(session=s).publish_skill(tenant_id=tenant_id,user_id=owner,skill_id=obj.id,payload=SkillPublishPayload(publish_note=note[:1024]),commit=False)
            result={'published':True}
        apply_visibility(s,tenant_id,owner,kind,obj.id,visibility,departments)
        s.flush()
        return result
    finally:
        if previous is None:s.info.pop('governance_approved_resource',None)
        else:s.info['governance_approved_resource']=previous


def private_resource(s,t,kind,rid):
    shared=s.scalar(text("SELECT visibility FROM resource_visibility WHERE tenant_id=:t AND kind=:k AND resource_id=:r"),{'t':t,'k':kind,'r':rid})
    departments=s.scalar(text("SELECT 1 FROM rx_resource_departments WHERE tenant_id=:t AND kind=:k AND resource_id=:r LIMIT 1"),{'t':t,'k':kind,'r':rid})
    return shared!='public' and not departments

def apply_visibility(s,t,u,kind,rid,value,departments):
    s.execute(text('INSERT INTO resource_visibility(tenant_id,kind,resource_id,visibility,updated_by) VALUES(:t,:k,:r,:v,:u) ON CONFLICT(tenant_id,kind,resource_id) DO UPDATE SET visibility=:v,updated_by=:u,updated_at=now()'),dict(t=t,k=kind,r=rid,v='public' if value=='workspace' else 'private',u=u))
    s.execute(text('DELETE FROM rx_resource_departments WHERE tenant_id=:t AND kind=:k AND resource_id=:r'),dict(t=t,k=kind,r=rid))
    for d in departments if value=='department' else []:
        s.execute(text('INSERT INTO rx_resource_departments(tenant_id,kind,resource_id,department_id) VALUES(:t,:k,:r,:d)'),dict(t=t,k=kind,r=rid,d=d))
    g.pop('_resource_acl_cache_key',None)

@console_ns.route('/admin/audit')
class Audit(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        p=require(s,tenant_id,current_user.id,'audit.view');clause,params=scope_clause(p)
        return {'data':clean(rows(s,f'SELECT * FROM rx_governance_audit WHERE tenant_id=:t AND {clause} ORDER BY id DESC LIMIT 100',t=tenant_id,**params))}

@event.listens_for(Session,'before_flush')
def protect_publication(s,flush_context,instances):
    if not has_request_context() or not request.path.startswith('/console/api/'):return
    from .visibility import principal
    who=principal()
    if not who or not enabled(s,who[1]):return
    allowed=s.info.get('governance_approved_resource')
    for obj in list(s.new)+list(s.dirty)+list(s.deleted):
        kind=rid=None
        if isinstance(obj,Agent) and str(obj.scope)=='roster':
            kind,rid='agent',obj.id
            change=inspect(obj)
            if (obj.active_config_is_published or (obj.source=='imported' and obj.active_config_has_model)) and (change.attrs.active_config_snapshot_id.history.has_changes() or change.attrs.active_config_is_published.history.has_changes() or change.attrs.active_config_has_model.history.has_changes()) and allowed!=(kind,rid):
                raise Forbidden('新版本必须提交发布审批')
        elif isinstance(obj,MCPToolProvider):kind,rid='mcp',obj.id
        elif isinstance(obj,Skill):
            kind,rid='skill',obj.id
            if obj.latest_published_version_id and inspect(obj).attrs.latest_published_version_id.history.has_changes() and allowed!=(kind,rid):raise Forbidden('技能版本必须提交发布审批')
        elif isinstance(obj,AgentConfigSnapshot) and obj in s.dirty:
            active=s.scalar(select(Agent).where(Agent.id==obj.agent_id,Agent.scope=='roster',Agent.active_config_snapshot_id==obj.id).execution_options(resource_acl_internal=True))
            if active and allowed!=('agent',obj.agent_id):raise Forbidden('不能直接修改线上版本，请编辑草稿并提交审批')
        elif isinstance(obj,App) and obj in s.dirty:
            change=inspect(obj)
            opening=(obj.enable_site and change.attrs.enable_site.history.has_changes()) or (obj.enable_api and change.attrs.enable_api.history.has_changes())
            if opening:
                agent=s.scalar(select(Agent).where(Agent.tenant_id==who[1],Agent.app_id==obj.id).execution_options(resource_acl_internal=True))
                if agent and allowed!=('agent',agent.id) and not private_resource(s,who[1],'agent',agent.id):
                    last=one(s,"SELECT summary FROM rx_releases WHERE tenant_id=:t AND kind='agent' AND resource_id=:r AND action='publish' AND state='approved' ORDER BY decided_at DESC LIMIT 1",t=who[1],r=agent.id)
                    if last and not last['summary'].get('external_access'):raise Forbidden('当前版本未获批对外访问，请重新提交发布申请并申请 Web/API 访问')
        elif isinstance(obj,AgentConfigDraft):kind,rid='agent',obj.agent_id
        elif isinstance(obj,SkillDraftFile):kind,rid='skill',obj.skill_id
        if kind and rid and allowed!=(kind,rid):
            # Serialize edits with submission/approval on the owning resource.
            from .visibility import MODELS
            model,_=MODELS[kind]
            s.execute(select(model.id).where(model.id==rid,model.tenant_id==who[1]).with_for_update().execution_options(resource_acl_internal=True))
            pending=s.execute(text("SELECT 1 FROM rx_releases WHERE tenant_id=:t AND kind=:k AND resource_id=:r AND state='pending'"),dict(t=who[1],k=kind,r=rid)).scalar()
            if pending:raise Conflict('该资源正在审批，请先撤回申请再修改配置')

@bp.before_request
def guard_legacy_publish():
    if request.method in ('GET','HEAD','OPTIONS'):return
    from .visibility import principal
    who=principal()
    if not who:return
    uid,t=who
    with Session(db.engine) as s:
        if not enabled(s,t):return
        path=request.path
        if path.endswith('/publish') and ('/agent/' in path or '/skills/' in path):deny(t,uid,'请在「我的发布」提交审批，审批通过后自动发布')
