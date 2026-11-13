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
from services.platform_governance import policy as P
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
    s.execute(text('INSERT INTO rx_governance_audit(tenant_id,actor_id,action,object_id,department_id,result,detail) VALUES(:t,:u,:a,:o,:d,:r,CAST(:j AS jsonb))'),dict(t=t,u=u or '',a=action,o=str(obj or ''),d=dept,r=result,j=json.dumps(detail or {},ensure_ascii=False)))

def deny(t,u,message,action='permission.denied',obj='',dept=None,detail=None):
    # Independent transaction: denied attempts survive the request rollback.
    with Session(db.engine) as s:
        audit(s,t,u,action,obj,dept,result='denied',detail={**(detail or {}),'reason':message});s.commit()
    raise Forbidden(message)

ERRORS={400:BadRequest,403:Forbidden,404:NotFound,409:Conflict}

def check(t,u,fn,*a,action='permission.denied',obj='',dept=None,detail=None,**k):
    """Run a pure policy rule; 403s are audited as denied human actions."""
    try:return fn(*a,**k)
    except P.PolicyError as e:
        if e.status==403:deny(t,u,e.message,action,obj,dept,detail)
        raise ERRORS.get(e.status,BadRequest)(e.message) from None

def member(s,t,u):
    found=s.scalar(select(Account).join(TenantAccountJoin,TenantAccountJoin.account_id==Account.id).where(TenantAccountJoin.tenant_id==t,Account.id==u))
    if not found or str(found.status) not in ('active','pending'): raise BadRequest('该成员不在当前工作空间或已停用')
    return found

def dept(s,t,d):
    r=one(s,'SELECT * FROM rx_departments WHERE tenant_id=:t AND id=:d',t=t,d=d)
    if not r: raise NotFound('部门不存在')
    return r

def all_departments(s,t):
    return rows(s,'SELECT id,name,parent_id FROM rx_departments WHERE tenant_id=:t ORDER BY name',t=t)

def expand(s,t,seeds):
    return P.descendant_ids(all_departments(s,t),seeds)

def membership(s,t,u):
    # One department per member; the first row wins for legacy multi-department data.
    return [r['department_id'] for r in rows(s,'SELECT department_id FROM rx_department_members WHERE tenant_id=:t AND account_id=:u ORDER BY department_id',t=t,u=u)]

def primary_departments(s,t):
    return {r['account_id']:r['department_id'] for r in rows(s,'SELECT DISTINCT ON (account_id) account_id,department_id FROM rx_department_members WHERE tenant_id=:t ORDER BY account_id,department_id',t=t)}

def account_names(s,t):
    return {r['id']:r['name'] for r in rows(s,'SELECT CAST(a.id AS text) id,a.name FROM accounts a JOIN tenant_account_joins j ON j.account_id=a.id WHERE j.tenant_id=:t',t=t)}

def is_super(s,t,u):
    return bool(s.execute(text("SELECT 1 FROM rx_admin_assignments WHERE tenant_id=:t AND account_id=:u AND role_id='role-super'"),{'t':t,'u':u}).scalar())

def authority(s,t,u):
    heads=[r['department_id'] for r in rows(s,'SELECT department_id FROM rx_department_heads WHERE tenant_id=:t AND account_id=:u',t=t,u=u)]
    name=s.execute(text('SELECT name FROM accounts WHERE id=:u'),{'u':u}).scalar()
    return P.build_authority(u,name,is_super(s,t,u),heads,membership(s,t,u),all_departments(s,t),enabled(s,t))

# Compatibility name used by older controllers.
permissions=authority

def require(s,t,u,permission=None,super_only=False):
    if request.method not in ('GET','HEAD','OPTIONS'):
        s.execute(text('SELECT tenant_id FROM rx_governance_settings WHERE tenant_id=:t FOR UPDATE'),{'t':t})
    p=authority(s,t,u)
    if not P.allows(p,permission,super_only):deny(t,u,'你没有此管理权限')
    return p

def serialize_release(r):return clean(r)

def scope_clause(p,column='department_id'):
    return ('TRUE',{}) if p['role']=='super_admin' else (f'{column} IN (SELECT jsonb_array_elements_text(CAST(:scopes AS jsonb)))',{'scopes':json.dumps(p['scope_ids'])})

@console_ns.route('/account/permissions')
class Permissions(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        p=authority(s,tenant_id,current_user.id)
        return {**p,'tenant_id':tenant_id,'member_department_ids':[p['department_id']] if p['department_id'] else []}

@console_ns.route('/admin/org')
class Organization(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        p=require(s,tenant_id,current_user.id,'org.members')
        from services.platform_organization.repository import OrganizationRepository
        from services.platform_organization.service import organization_view
        return organization_view(OrganizationRepository(s),tenant_id,p)

@console_ns.route('/admin/departments')
class Departments(Resource):
    @auth
    def post(self,s,tenant_id,current_user):
        require(s,tenant_id,current_user.id,super_only=True);b=body();name=label(b.get('name'))
        parent=ident(b['parent_id']) if b.get('parent_id') else None
        if parent:dept(s,tenant_id,parent)
        did=str(uuid4());s.execute(text('INSERT INTO rx_departments(id,tenant_id,name,parent_id) VALUES(:id,:t,:n,:p)'),dict(id=did,t=tenant_id,n=name,p=parent))
        audit(s,tenant_id,current_user.id,'department.create',did,did,detail={'name':name,'object_name':name,'summary':'新建部门'})
        return {'id':did,'name':name,'parent_id':parent}

@console_ns.route('/admin/departments/<string:did>')
class Department(Resource):
    @auth
    def put(self,s,tenant_id,current_user,did):
        require(s,tenant_id,current_user.id,super_only=True);did=ident(did);old=dept(s,tenant_id,did);b=body()
        parent=ident(b['parent_id']) if b.get('parent_id') else None
        if parent:
            dept(s,tenant_id,parent)
            if parent in expand(s,tenant_id,[did]):raise BadRequest('不能把部门放到自身或下级部门下面')
        name=label(b.get('name'));s.execute(text('UPDATE rx_departments SET name=:n,parent_id=:p WHERE tenant_id=:t AND id=:d'),dict(n=name,p=parent,t=tenant_id,d=did))
        moved=parent!=old['parent_id'];renamed=name!=old['name']
        action='department.move' if moved and not renamed else 'department.rename' if renamed and not moved else 'department.update'
        summary='、'.join(x for x in [f"重命名为「{name}」" if renamed else '','移动部门' if moved else ''] if x) or '修改部门'
        audit(s,tenant_id,current_user.id,action,did,did,detail={'object_name':name,'summary':summary})
        return {'id':did,'name':name,'parent_id':parent}
    @auth
    def delete(self,s,tenant_id,current_user,did):
        require(s,tenant_id,current_user.id,super_only=True);did=ident(did);d=dept(s,tenant_id,did)
        for table,col in [('rx_departments','parent_id'),('rx_department_members','department_id'),('rx_department_heads','department_id')]:
            if s.execute(text(f'SELECT 1 FROM {table} WHERE tenant_id=:t AND {col}=:d LIMIT 1'),dict(t=tenant_id,d=did)).scalar():raise Conflict('部门仍有成员、下级部门或负责人，不能删除')
        if s.execute(text('SELECT 1 FROM rx_integrations WHERE tenant_id=:t AND department_id=:d LIMIT 1'),dict(t=tenant_id,d=did)).scalar():raise Conflict('部门仍被应用接入引用，不能删除')
        # An empty leaf department has no viewers, so its share grants are inert.
        s.execute(text('DELETE FROM rx_resource_departments WHERE tenant_id=:t AND department_id=:d'),dict(t=tenant_id,d=did))
        s.execute(text('DELETE FROM rx_departments WHERE tenant_id=:t AND id=:d'),dict(t=tenant_id,d=did))
        audit(s,tenant_id,current_user.id,'department.delete',did,did,detail={'object_name':d['name'],'summary':'删除部门'})
        return {'result':'success'}

def set_member_department(s,t,actor,uid,target):
    account=member(s,t,uid)
    if target:dept(s,t,target)
    before=membership(s,t,uid)
    s.execute(text('DELETE FROM rx_department_members WHERE tenant_id=:t AND account_id=:u'),dict(t=t,u=uid))
    if target:s.execute(text('INSERT INTO rx_department_members(tenant_id,account_id,department_id) VALUES(:t,:u,:d)'),dict(t=t,u=uid,d=target))
    names={d['id']:d['name'] for d in all_departments(s,t)}
    audit(s,t,actor,'member.department',uid,target or (before[0] if before else None),detail={'object_name':account.name,'summary':f"调整部门为「{names.get(target,'未分配')}」" if target else '移出部门','department_id':target})

@console_ns.route('/admin/members/<string:uid>/department')
class MemberDepartment(Resource):
    @auth
    def put(self,s,tenant_id,current_user,uid):
        require(s,tenant_id,current_user.id,super_only=True);uid=ident(uid);b=body()
        target=ident(b['department_id']) if b.get('department_id') else None
        set_member_department(s,tenant_id,current_user.id,uid,target)
        return {'result':'success','department_id':target}

@console_ns.route('/admin/members/<string:uid>/departments')
class MemberDepartments(Resource):
    # Legacy multi-department API: members now belong to one department (first entry).
    @auth
    def put(self,s,tenant_id,current_user,uid):
        require(s,tenant_id,current_user.id,super_only=True);uid=ident(uid);values=ids(body().get('department_ids'))
        set_member_department(s,tenant_id,current_user.id,uid,values[0] if values else None)
        return {'result':'success','department_ids':values[:1]}

@console_ns.route('/admin/department-heads')
class DepartmentHeads(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        p=require(s,tenant_id,current_user.id,'org.members')
        data=rows(s,"""SELECT h.department_id,d.name department_name,h.account_id,a.name,g.name granted_by_name,h.granted_at
          FROM rx_department_heads h JOIN rx_departments d ON d.tenant_id=h.tenant_id AND d.id=h.department_id
          LEFT JOIN accounts a ON CAST(a.id AS text)=h.account_id LEFT JOIN accounts g ON CAST(g.id AS text)=h.granted_by
          WHERE h.tenant_id=:t ORDER BY d.name,a.name""",t=tenant_id)
        if p['role']!='super_admin':data=[r for r in data if r['department_id'] in p['scope_ids']]
        return {'data':data}
    @auth
    def post(self,s,tenant_id,current_user):
        require(s,tenant_id,current_user.id,super_only=True);b=body()
        did=ident(b.get('department_id'));uid=ident(b.get('account_id'));d=dept(s,tenant_id,did);account=member(s,tenant_id,uid)
        mine=membership(s,tenant_id,uid)
        if not mine or mine[0] not in P.ancestor_ids(all_departments(s,tenant_id),did):raise BadRequest('部门负责人需从该部门或上级部门的成员中选择')
        s.execute(text('INSERT INTO rx_department_heads(tenant_id,department_id,account_id,granted_by) VALUES(:t,:d,:u,:g) ON CONFLICT DO NOTHING'),dict(t=tenant_id,d=did,u=uid,g=current_user.id))
        audit(s,tenant_id,current_user.id,'head.set',uid,did,detail={'object_name':account.name,'summary':f"设置为「{d['name']}」负责人"})
        return {'result':'success'}

@console_ns.route('/admin/department-heads/<string:did>/<string:uid>')
class DepartmentHead(Resource):
    @auth
    def delete(self,s,tenant_id,current_user,did,uid):
        require(s,tenant_id,current_user.id,super_only=True);did=ident(did);uid=ident(uid)
        gone=s.execute(text('DELETE FROM rx_department_heads WHERE tenant_id=:t AND department_id=:d AND account_id=:u'),dict(t=tenant_id,d=did,u=uid)).rowcount
        if not gone:raise NotFound('负责人不存在')
        d=one(s,'SELECT name FROM rx_departments WHERE tenant_id=:t AND id=:d',t=tenant_id,d=did) or {}
        audit(s,tenant_id,current_user.id,'head.remove',uid,did,detail={'object_name':account_names(s,tenant_id).get(uid,''),'summary':f"移除「{d.get('name','')}」负责人"})
        return {'result':'success'}

def ensure_super_role(s,t):
    s.execute(text("INSERT INTO rx_admin_roles(tenant_id,id,name,permissions,preset) VALUES(:t,'role-super','超级管理员','[]',true) ON CONFLICT DO NOTHING"),{'t':t})

@console_ns.route('/admin/super-admins')
class SuperAdmins(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        require(s,tenant_id,current_user.id,super_only=True)
        primary=primary_departments(s,tenant_id);names={d['id']:d['name'] for d in all_departments(s,tenant_id)}
        data=rows(s,"""SELECT g.account_id,a.name,a.email,b.name granted_by_name,g.updated_at granted_at FROM rx_admin_assignments g
          JOIN accounts a ON CAST(a.id AS text)=g.account_id LEFT JOIN accounts b ON CAST(b.id AS text)=g.granted_by
          WHERE g.tenant_id=:t AND g.role_id='role-super' ORDER BY a.name""",t=tenant_id)
        return {'data':[{**r,'department_name':names.get(primary.get(r['account_id']))} for r in data]}
    @auth
    def post(self,s,tenant_id,current_user):
        require(s,tenant_id,current_user.id,super_only=True);uid=ident(body().get('account_id'));account=member(s,tenant_id,uid)
        ensure_super_role(s,tenant_id)
        s.execute(text("INSERT INTO rx_admin_assignments(tenant_id,account_id,role_id,department_ids,granted_by) VALUES(:t,:u,'role-super','[]',:g) ON CONFLICT(tenant_id,account_id) DO UPDATE SET role_id='role-super',department_ids='[]',granted_by=:g,updated_at=now()"),dict(t=tenant_id,u=uid,g=current_user.id))
        audit(s,tenant_id,current_user.id,'super.grant',uid,(membership(s,tenant_id,uid) or [None])[0],detail={'object_name':account.name,'summary':'任命超级管理员'})
        return {'result':'success'}

@console_ns.route('/admin/super-admins/<string:uid>')
class SuperAdmin(Resource):
    @auth
    def delete(self,s,tenant_id,current_user,uid):
        require(s,tenant_id,current_user.id,super_only=True);uid=ident(uid)
        if not is_super(s,tenant_id,uid):raise NotFound('该成员不是超级管理员')
        protect_last_super(s,tenant_id,uid,None)
        s.execute(text('DELETE FROM rx_admin_assignments WHERE tenant_id=:t AND account_id=:u'),dict(t=tenant_id,u=uid))
        audit(s,tenant_id,current_user.id,'super.revoke',uid,(membership(s,tenant_id,uid) or [None])[0],detail={'object_name':account_names(s,tenant_id).get(uid,''),'summary':'撤销超级管理员'})
        return {'result':'success'}

@console_ns.route('/admin/identity-source')
class IdentitySource(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        require(s,tenant_id,current_user.id,'org.members')
        from services.partner_auth.config import load_config
        c=load_config()
        return {'provider':'partner_auth','issuer':c.issuer,'configured':c.configured,'methods':['企业统一身份（OIDC 授权码 + PKCE）','账号密码（开发/演示）'],
                'note':'账号来自统一身份，部门在本平台维护；首次登录自动建立平台成员（未分配部门）。'}

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
    s.execute(text('INSERT INTO rx_releases(id,tenant_id,applicant_id,kind,resource_id,resource_name,action,department_id,visibility,department_ids,fingerprint,summary,note,assignee,applicant_department_id) VALUES(:id,:t,:u,:k,:r,:n,:a,:d,:v,CAST(:ds AS jsonb),:f,CAST(:j AS jsonb),:note,:as,:ad)'),dict(id=rid,t=tenant_id,u=owner,k=kind,r=r.id,n=summary['name'],a=action,d=did,v=visibility,ds=json.dumps(targets),f=digest,j=json.dumps(summary,ensure_ascii=False),note=note,**{'as':P.initial_assignee(P.api_scope(visibility)),'ad':did or (membership(s,tenant_id,owner) or [None])[0]}))
    if visibility=='private':
        with as_owner(s,owner):
            result=execute_release(s,tenant_id,owner,r,kind,action,note,summary,visibility,targets)
        s.execute(text("UPDATE rx_releases SET state='approved',decided_at=now(),comment='Private 直接生效，无需审批',result=CAST(:j AS jsonb) WHERE id=:id"),{'id':rid,'j':json.dumps({**result,'approval_required':False})})
        audit(s,tenant_id,current_user.id,'release.private',rid,detail={'kind':kind,'action':action,'external_access':summary.get('external_access',False)})
    else:
        audit(s,tenant_id,current_user.id,'release.submit',rid,did,detail={'kind':kind,'action':action,'visibility':visibility})
    return clean(one(s,'SELECT * FROM rx_releases WHERE id=:id',id=rid))

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

# ------------------------------------------------------------------ share requests
# Raw SQL readers: approvers must see resource facts without passing the
# viewer ACL, and teams are not ORM models.

LOCK={'agent':' FOR UPDATE OF a','skill':' FOR UPDATE OF k','mcp':' FOR UPDATE','team':' FOR UPDATE OF tm'}
RESOURCE_SQL={
 'agent':"""SELECT CAST(a.id AS text) id,a.name,a.description,CAST(a.created_by AS text) owner_id,a.active_config_is_published published,
   CAST(a.active_config_snapshot_id AS text) snapshot_id,CAST(a.app_id AS text) app_id,a.updated_at,v.version FROM agents a
   LEFT JOIN agent_config_snapshots v ON v.id=a.active_config_snapshot_id WHERE a.tenant_id=:t AND a.scope='roster' AND a.status='active'""",
 'skill':"""SELECT CAST(k.id AS text) id,k.display_name AS name,k.description,CAST(k.created_by AS text) owner_id,k.latest_published_version_id IS NOT NULL published,
   CAST(k.latest_published_version_id AS text) snapshot_id,k.updated_at,v.version_number AS version FROM skills k
   LEFT JOIN skill_versions v ON v.id=k.latest_published_version_id WHERE k.tenant_id=:t""",
 'mcp':"""SELECT CAST(id AS text) id,name,'' AS description,CAST(user_id AS text) owner_id,authed AS published,NULL AS snapshot_id,updated_at,NULL AS version
   FROM tool_mcp_providers WHERE tenant_id=:t""",
 'team':"""SELECT tm.id,tm.name,COALESCE(tm.config->>'description','') description,tm.created_by owner_id,tm.published_id IS NOT NULL published,
   tm.published_id snapshot_id,to_timestamp(tm.updated_at) updated_at,v.version FROM raccoon_teams tm
   LEFT JOIN raccoon_team_versions v ON v.id=tm.published_id WHERE tm.tenant_id=:t AND tm.deleted_at IS NULL""",
}
ID_COLUMN={'agent':'a.id','skill':'k.id','mcp':'id','team':'tm.id'}
OWNER_COLUMN={'agent':'a.created_by','skill':'k.created_by','mcp':'user_id','team':'tm.created_by'}

def resource_info(s,t,kind,rid,lock=False):
    if kind not in P.KINDS:raise BadRequest('资源类型无效')
    rid=str(rid or '')
    if kind=='mcp':
        try:rid=str(UUID(rid));where=' AND id=:r'
        except ValueError:where=' AND server_identifier=:r'
    else:
        rid=ident(rid);where=f' AND {ID_COLUMN[kind]}=:r'
    r=one(s,RESOURCE_SQL[kind]+where+(LOCK[kind] if lock else ''),t=t,r=rid)
    if not r:raise NotFound('资源不存在')
    r['version']=f"v{r['version']}" if r.get('version') is not None else ''
    r['published']=bool(r['published'])
    return r

def owned_resources(s,t,kind,u):
    out=rows(s,RESOURCE_SQL[kind]+f' AND CAST({OWNER_COLUMN[kind]} AS text)=:u',t=t,u=u)
    for r in out:
        r['version']=f"v{r['version']}" if r.get('version') is not None else '';r['published']=bool(r['published'])
    return out

class Visibility:
    """Tenant-wide snapshot of resource sharing, loaded once per request."""
    def __init__(self,s,t):
        self.public={(k,r) for k,r in s.execute(text("SELECT kind,resource_id FROM resource_visibility WHERE tenant_id=:t AND visibility='public'"),{'t':t})}
        self.departments={}
        for k,r,d in s.execute(text('SELECT kind,resource_id,department_id FROM rx_resource_departments WHERE tenant_id=:t ORDER BY department_id'),{'t':t}):
            self.departments.setdefault((k,r),[]).append(d)
    def scope(self,kind,rid):
        return P.current_scope((kind,rid) in self.public,bool(self.departments.get((kind,rid))))
    def department(self,kind,rid):
        return (self.departments.get((kind,rid)) or [None])[0]

REQUEST_SQL="""SELECT r.*,ap.name applicant_name,rv.name reviewer_name,fw.name forwarded_by_name FROM rx_releases r
 LEFT JOIN accounts ap ON CAST(ap.id AS text)=r.applicant_id LEFT JOIN accounts rv ON CAST(rv.id AS text)=r.reviewer_id
 LEFT JOIN accounts fw ON CAST(fw.id AS text)=r.forwarded_by WHERE r.tenant_id=:t"""
APPROVAL_ONLY=" AND COALESCE((r.summary->>'approval_required')::boolean,true)"

def share_request(r,viewer,vis,dnames):
    if not r:return None
    requested=P.api_scope(r['visibility']);d=P.request_department(r)
    return {'id':r['id'],'code':P.request_code(r['created_at'],r['id']),'kind':r['kind'],'resource_id':r['resource_id'],'resource_name':r['resource_name'],
        'version':(r.get('summary') or {}).get('version',''),'applicant_id':r['applicant_id'],'applicant_name':r.get('applicant_name') or '',
        'applicant_department_id':d,'applicant_department_name':dnames.get(d),'requested_scope':requested,
        'approved_scope':P.api_scope(r['approved_visibility']) if r.get('approved_visibility') else None,
        'department_id':d,'department_name':dnames.get(d),'current_scope':vis.scope(r['kind'],r['resource_id']),'note':r.get('note') or '',
        'state':r['state'],'assignee':'super_admin' if requested=='public' else (r.get('assignee') or 'dept_head'),
        'forwarded_by_name':r.get('forwarded_by_name'),'forwarded_at':r.get('forwarded_at'),'forward_comment':r.get('forward_comment'),
        'reviewer_name':r.get('reviewer_name'),'comment':r.get('comment') or '','created_at':r['created_at'],'decided_at':r.get('decided_at'),
        'can_decide':bool(viewer) and P.can_decide(viewer,r),'can_forward':bool(viewer) and P.can_forward(viewer,r)}

def dept_names(s,t):
    return {d['id']:d['name'] for d in all_departments(s,t)}

def latest_request(s,t,kind,rid):
    return one(s,REQUEST_SQL+APPROVAL_ONLY+' AND r.kind=:k AND r.resource_id=:r ORDER BY r.created_at DESC LIMIT 1',t=t,k=kind,r=rid)

def resource_share(kind,info,viewer,vis,dnames,latest):
    scope=vis.scope(kind,info['id']);d=vis.department(kind,info['id']) if scope=='department' else None
    return {'kind':kind,'resource_id':info['id'],'name':info['name'],'visibility':scope,'department_id':d,'department_name':dnames.get(d),
        'can_manage':info['owner_id']==viewer['account_id'],'owner_id':info['owner_id'],'published':info['published'],
        'request':share_request(latest,viewer,vis,dnames),'updated_at':clean(info.get('updated_at'))}

def share_view(s,t,u,kind,info):
    return resource_share(kind,info,authority(s,t,u),Visibility(s,t),dept_names(s,t),latest_request(s,t,kind,info['id']))

def lock_tenant(s,t):
    s.execute(text('SELECT tenant_id FROM rx_governance_settings WHERE tenant_id=:t FOR UPDATE'),{'t':t})

def make_private(s,t,u,kind,rid):
    """Owner-only, immediate: revoke sharing and withdraw any pending request."""
    lock_tenant(s,t);info=resource_info(s,t,kind,rid,True)
    if info['owner_id']!=u:deny(t,u,'仅创建者可以修改共享范围','release.private',info['id'],detail={'object_name':info['name'],'summary':'改为仅个人'})
    before=Visibility(s,t).scope(kind,info['id'])
    apply_visibility(s,t,u,kind,info['id'],'private',[])
    if kind=='skill':s.execute(text("UPDATE skills SET visibility='private' WHERE tenant_id=:t AND id=:r"),{'t':t,'r':info['id']})
    withdrawn=s.execute(text("UPDATE rx_releases SET state='withdrawn',comment='改为仅个人，审批中的申请自动撤回',decided_at=now() WHERE tenant_id=:t AND kind=:k AND resource_id=:r AND state='pending'"),dict(t=t,k=kind,r=info['id'])).rowcount
    summary='改为仅个人'+(f"（原为{P.SCOPE_LABEL[before]}）" if before!='private' else '')+('，审批中的申请已撤回' if withdrawn else '')
    audit(s,t,u,'release.private',info['id'],(membership(s,t,u) or [None])[0],detail={'object_name':info['name'],'summary':summary,'kind':kind})
    return share_view(s,t,u,kind,info)

@console_ns.route('/resource-shares')
class ResourceShares(Resource):
    @auth
    def post(self,s,tenant_id,current_user):
        b=body();kind=b.get('kind');scope=b.get('scope')
        if kind not in P.KINDS:raise BadRequest('资源类型无效')
        if scope=='private':return make_private(s,tenant_id,current_user.id,kind,b.get('resource_id'))
        u=current_user.id;lock_tenant(s,tenant_id);info=resource_info(s,tenant_id,kind,b.get('resource_id'),True)
        if info['owner_id']!=u:deny(tenant_id,u,'仅资源创建者可以申请共享','release.submit',info['id'],detail={'object_name':info['name'],'summary':'申请共享'})
        note=check(tenant_id,u,P.check_note,b.get('note'))
        viewer=authority(s,tenant_id,u);vis=Visibility(s,tenant_id);d=viewer['department_id']
        pending=s.execute(text("SELECT 1 FROM rx_releases WHERE tenant_id=:t AND kind=:k AND resource_id=:r AND state='pending' FOR UPDATE"),dict(t=tenant_id,k=kind,r=info['id'])).scalar()
        check(tenant_id,u,P.check_share_request,scope,vis.scope(kind,info['id']),d,info['published'],kind,bool(pending))
        rid=str(uuid4());stored=P.stored_scope(scope)
        digest=hashlib.sha256(json.dumps({k:info.get(k) for k in ('id','name','snapshot_id','version')},sort_keys=True,default=str).encode()).hexdigest()
        summary={'name':info['name'],'kind':kind,'version':info['version'],'approval_required':True}
        s.execute(text("""INSERT INTO rx_releases(id,tenant_id,applicant_id,kind,resource_id,resource_name,action,department_id,visibility,department_ids,fingerprint,summary,note,assignee,applicant_department_id)
          VALUES(:id,:t,:u,:k,:r,:n,'share',:d,:v,CAST(:ds AS jsonb),:f,CAST(:j AS jsonb),:note,:as,:d)"""),
          dict(id=rid,t=tenant_id,u=u,k=kind,r=info['id'],n=info['name'][:255],d=d,v=stored,ds=json.dumps([d] if scope=='department' else []),f=digest,
               j=json.dumps(summary,ensure_ascii=False),note=note,**{'as':P.initial_assignee(scope)}))
        audit(s,tenant_id,u,'release.submit',rid,d,detail={'object_name':info['name'],'summary':f"申请共享到{P.SCOPE_LABEL[scope]}",'kind':kind})
        return share_view(s,tenant_id,u,kind,info)

@console_ns.route('/releases/<string:rid>/withdraw')
class Withdraw(Resource):
    @auth
    def post(self,s,tenant_id,current_user,rid):
        r=one(s,'SELECT * FROM rx_releases WHERE tenant_id=:t AND id=:id FOR UPDATE',t=tenant_id,id=ident(rid))
        if not r:raise NotFound('申请不存在')
        if r['applicant_id']!=current_user.id:deny(tenant_id,current_user.id,'只能撤回自己的申请','release.withdraw',r['id'],detail={'object_name':r['resource_name'],'summary':'撤回申请'})
        if r['state']!='pending':raise Conflict('申请已经处理，不能再次撤回')
        s.execute(text("UPDATE rx_releases SET state='withdrawn',decided_at=now() WHERE id=:id"),{'id':r['id']})
        audit(s,tenant_id,current_user.id,'release.withdraw',r['id'],P.request_department(r),detail={'object_name':r['resource_name'],'summary':f"撤回{P.SCOPE_LABEL[P.api_scope(r['visibility'])]}共享申请"})
        return share_request(one(s,REQUEST_SQL+' AND r.id=:id',t=tenant_id,id=r['id']),authority(s,tenant_id,current_user.id),Visibility(s,tenant_id),dept_names(s,tenant_id))

@console_ns.route('/releases/mine')
class MyReleases(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        u=current_user.id;viewer=authority(s,tenant_id,u);vis=Visibility(s,tenant_id);dnames=dept_names(s,tenant_id)
        latest={}
        for r in rows(s,REQUEST_SQL+APPROVAL_ONLY+' AND r.applicant_id=:u ORDER BY r.created_at DESC',t=tenant_id,u=u):
            latest.setdefault((r['kind'],r['resource_id']),r)
        data=[]
        for kind in ('agent','team','skill','mcp'):
            for info in owned_resources(s,tenant_id,kind,u):
                data.append(resource_share(kind,info,viewer,vis,dnames,latest.get((kind,info['id']))))
        data.sort(key=lambda x:x['updated_at'] or '',reverse=True)
        return {'data':data}

def visible_request(s,t,viewer,rid):
    r=one(s,REQUEST_SQL+APPROVAL_ONLY+' AND r.id=:id',t=t,id=ident(rid))
    if not r or not P.visible_in_approvals(viewer,r,'all'):raise NotFound('申请不存在或不在你的审批范围内')
    return r

@console_ns.route('/admin/approvals')
class Approvals(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        p=require(s,tenant_id,current_user.id,'release.approve')
        tab=request.args.get('state','pending')
        if tab not in ('pending','done','all'):tab='pending'
        vis=Visibility(s,tenant_id);dnames=dept_names(s,tenant_id)
        found=[r for r in rows(s,REQUEST_SQL+APPROVAL_ONLY+' ORDER BY r.created_at DESC LIMIT 1000',t=tenant_id) if P.visible_in_approvals(p,r,tab)]
        return {'data':[share_request(r,p,vis,dnames) for r in found[:200]]}

def _json(v):
    if isinstance(v,str):
        try:return json.loads(v)
        except ValueError:return {}
    return v or {}

def agent_details(s,t,info):
    config=_json(s.execute(text('SELECT config_snapshot FROM agent_config_snapshots WHERE id=:i'),{'i':info['snapshot_id']}).scalar()) if info.get('snapshot_id') else {}
    if not config:config=_json(s.execute(text("SELECT config_snapshot FROM agent_config_drafts WHERE agent_id=:a AND draft_type='draft' LIMIT 1"),{'a':info['id']}).scalar())
    model=(config.get('model') or {}).get('model') or ''
    tools=[x.get('name') or x.get('tool_name') or x.get('provider') or x.get('provider_id') for x in (config.get('tools') or {}).get('dify_tools',[]) if x.get('enabled',True)]
    tools+=[x.get('label') or x.get('name') or x.get('tool_name') for x in (config.get('tools') or {}).get('cli_tools',[])]
    skills=[x.get('name') for x in config.get('config_skills') or []]
    skills+=[r['name'] for r in rows(s,'SELECT k.display_name AS name FROM agent_skill_bindings b JOIN skills k ON k.id=b.skill_id WHERE b.tenant_id=:t AND b.agent_id=:a ORDER BY b.priority',t=t,a=info['id'])]
    knowledge=[x.get('name') for x in (config.get('knowledge') or {}).get('sets',[])]
    note=s.execute(text('SELECT version_note FROM agent_config_snapshots WHERE id=:i'),{'i':info['snapshot_id']}).scalar() if info.get('snapshot_id') else None
    clean_list=lambda v:list(dict.fromkeys(x for x in v if x))
    return {'model':model,'prompt':((config.get('prompt') or {}).get('system_prompt') or '')[:4000],'tools':clean_list(tools),'skills':clean_list(skills),'knowledge':clean_list(knowledge)},note

def approval_detail(s,t,viewer,r):
    vis=Visibility(s,t);dnames=dept_names(s,t);base=share_request(r,viewer,vis,dnames);kind=r['kind']
    names=account_names(s,t)
    try:info=resource_info(s,t,kind,r['resource_id'])
    except NotFound:info=None
    checks=[];deps=[];changes=[]
    url={'agent':f"agents/{r['resource_id']}",'team':f"teams/{r['resource_id']}",'skill':'skills/local','mcp':'integrations/mcp'}[kind]
    res={'description':(info or {}).get('description') or '','url':url,'owner_name':names.get((info or {}).get('owner_id') or r['applicant_id'],'')}
    if not info:
        checks.append({'level':'risk','text':'资源已删除或不可用'})
    else:
        checks.append({'level':'ok','text':f"已发布 {info['version']}".strip()} if info['published'] else {'level':'risk','text':P.PUBLISH_REQUIRED[kind]})
        if info['version']:changes.append(f"当前版本 {info['version']}")
    if info and kind=='agent':
        detail,note=agent_details(s,t,info);res['agent']=detail
        checks.append({'level':'ok','text':f"已配置模型 {detail['model']}"} if detail['model'] else {'level':'warn','text':'未配置模型'})
        if not detail['prompt'].strip():checks.append({'level':'warn','text':'系统提示词为空'})
        deps+=[f'模型：{detail["model"]}'] if detail['model'] else []
        deps+=[f'工具：{x}' for x in detail['tools']]+[f'Skill：{x}' for x in detail['skills']]+[f'知识库：{x}' for x in detail['knowledge']]
        if note:changes.append(f'版本说明：{note[:200]}')
    elif info and kind=='team':
        config=_json(s.execute(text('SELECT config FROM raccoon_teams WHERE id=:i'),{'i':info['id']}).scalar())
        ids_=[config.get('leader_id')]+[m.get('agent_id') for m in config.get('members') or []]
        agents_={x['id']:x for x in rows(s,"SELECT CAST(id AS text) id,name,active_config_is_published published FROM agents WHERE tenant_id=:t AND CAST(id AS text) IN (SELECT jsonb_array_elements_text(CAST(:ids AS jsonb)))",t=t,ids=json.dumps([x for x in ids_ if x]))}
        leader=agents_.get(config.get('leader_id'),{}).get('name') or ''
        members=[agents_.get(m.get('agent_id'),{}).get('name') or '已删除的智能体' for m in config.get('members') or []]
        res['team']={'leader':leader,'members':members}
        checks.append({'level':'ok','text':f'团队成员 {len(members)} 个'} if members else {'level':'warn','text':'团队没有成员智能体'})
        if any(x and not agents_.get(x,{}).get('published') for x in ids_):checks.append({'level':'warn','text':'部分成员智能体未发布或已删除'})
        deps+=[f'团长：{leader}'] if leader else []
        deps+=[f'智能体：{x}' for x in members]
    elif info and kind=='skill':
        files=rows(s,'SELECT path,content_text FROM skill_draft_files WHERE skill_id=:k ORDER BY path',k=info['id'])
        instructions=next((f['content_text'] or '' for f in files if f['path']=='SKILL.md'),'')
        res['skill']={'files':[f['path'] for f in files],'instructions':instructions[:2000]}
        checks.append({'level':'ok','text':'包含 SKILL.md'} if instructions else {'level':'warn','text':'缺少 SKILL.md 说明'})
        deps.append(f'文件：{len(files)} 个')
        v=one(s,'SELECT version_name,publish_note FROM skill_versions WHERE id=:i',i=info['snapshot_id']) if info.get('snapshot_id') else None
        if v and (v.get('publish_note') or v.get('version_name')):changes.append(f"版本说明：{(v.get('publish_note') or v.get('version_name'))[:200]}")
    elif info and kind=='mcp':
        url_='';tools=[]
        try:
            from .visibility import raw_resource
            row=raw_resource(s,t,'mcp',info['id'])
            tools=[x.get('name') for x in row.tool_dict if x.get('name')]
            url_=row.to_entity().decrypt_server_url()
        except Exception:
            logging.getLogger(__name__).warning('mcp detail unavailable for %s',info['id'])
        res['mcp']={'server_url':P.mask_url(url_),'tools':tools,'authorized':info['published']}
        if url_.startswith('http://'):checks.append({'level':'warn','text':'服务地址未使用 HTTPS'})
        checks.append({'level':'ok','text':f'工具 {len(tools)} 个'} if tools else {'level':'warn','text':'未发现可用工具'})
        deps+=[f'工具：{x}' for x in tools]
    if base['requested_scope']=='public':checks.append({'level':'warn','text':'申请公共空间：当前租户全部成员可见'})
    changes.insert(0,f"可见范围：{P.SCOPE_LABEL.get(base['current_scope'])} → {P.SCOPE_LABEL.get(base['requested_scope'])}")
    names.update({k:v for k,v in ((r['applicant_id'],r.get('applicant_name')),(r.get('reviewer_id'),r.get('reviewer_name')),(r.get('forwarded_by'),r.get('forwarded_by_name'))) if k and v})
    return {**base,'resource':res,'checks':checks,'dependencies':deps,'changes':changes,'timeline':clean(P.timeline(r,names))}

@console_ns.route('/admin/approvals/<string:rid>')
class Approval(Resource):
    @auth
    def get(self,s,tenant_id,current_user,rid):
        p=require(s,tenant_id,current_user.id,'release.approve')
        return approval_detail(s,tenant_id,p,visible_request(s,tenant_id,p,rid))

def reload_request(s,t,viewer,rid):
    return share_request(one(s,REQUEST_SQL+' AND r.id=:id',t=t,id=rid),viewer,Visibility(s,t),dept_names(s,t))

@console_ns.route('/admin/approvals/<string:rid>/decision')
class Decision(Resource):
    @auth
    def post(self,s,tenant_id,current_user,rid):
        u=current_user.id;p=require(s,tenant_id,u,'release.approve');b=body();decision=b.get('decision')
        comment=b.get('comment') if isinstance(b.get('comment'),str) else ''
        if len(comment)>2000:raise BadRequest('意见过长')
        r=one(s,'SELECT * FROM rx_releases WHERE tenant_id=:t AND id=:id FOR UPDATE',t=tenant_id,id=ident(rid))
        if not r or not COALESCE_APPROVAL(r):raise NotFound('申请不存在')
        action='release.'+(decision if decision in ('approve','reject','return') else 'approve')
        meta=dict(action=action,obj=r['id'],dept=P.request_department(r),detail={'object_name':r['resource_name'],'summary':'审批申请'})
        state,approved=check(tenant_id,u,P.validate_decision,p,r,decision,b.get('scope'),comment,**meta)
        if r['action']=='publish':
            if decision=='approve' and p['role']!='super_admin' and (r['summary'] or {}).get('external_access'):deny(tenant_id,u,'涉及对外访问的申请需要超级管理员审批',**meta)
            return legacy_decide(s,tenant_id,current_user,p,r,decision,comment.strip())
        if state=='approved':
            info=resource_info(s,tenant_id,r['kind'],r['resource_id'],True)
            if info['owner_id']!=r['applicant_id']:raise Conflict('资源归属已变化，请重新提交')
            if approved=='department':
                target=P.request_department(r)
                if not target:raise Conflict('申请人未分配部门，无法共享到部门')
                dept(s,tenant_id,target)
                apply_visibility(s,tenant_id,r['applicant_id'],r['kind'],info['id'],'department',[target])
            else:
                apply_visibility(s,tenant_id,r['applicant_id'],r['kind'],info['id'],'workspace',[])
                if r['kind']=='skill':s.execute(text("UPDATE skills SET visibility='public' WHERE tenant_id=:t AND id=:r"),{'t':tenant_id,'r':info['id']})
        s.execute(text('UPDATE rx_releases SET state=:state,reviewer_id=:u,comment=:c,approved_visibility=:av,decided_at=now() WHERE id=:id'),
                  dict(state=state,u=u,c=comment.strip(),av=P.stored_scope(approved) if approved else None,id=r['id']))
        summary=f"通过 · {P.SCOPE_LABEL[approved]}" if state=='approved' else '驳回' if state=='rejected' else '退回'
        if state=='approved' and approved!=P.api_scope(r['visibility']):summary+='（由公共空间收窄）'
        audit(s,tenant_id,u,action,r['id'],P.request_department(r),detail={'object_name':r['resource_name'],'summary':summary,'state':state})
        return reload_request(s,tenant_id,p,r['id'])

def COALESCE_APPROVAL(r):
    v=(r.get('summary') or {}).get('approval_required')
    return v is None or bool(v)

@console_ns.route('/admin/approvals/<string:rid>/forward')
class Forward(Resource):
    @auth
    def post(self,s,tenant_id,current_user,rid):
        u=current_user.id;p=require(s,tenant_id,u,'release.approve');b=body()
        r=one(s,'SELECT * FROM rx_releases WHERE tenant_id=:t AND id=:id FOR UPDATE',t=tenant_id,id=ident(rid))
        if not r or not COALESCE_APPROVAL(r):raise NotFound('申请不存在')
        comment=check(tenant_id,u,P.validate_forward,p,r,b.get('comment'),action='release.forward',obj=r['id'],dept=P.request_department(r),detail={'object_name':r['resource_name'],'summary':'转审超级管理员'})
        s.execute(text("UPDATE rx_releases SET assignee='super_admin',forwarded_by=:u,forwarded_at=now(),forward_comment=:c WHERE id=:id"),dict(u=u,c=comment,id=r['id']))
        audit(s,tenant_id,u,'release.forward',r['id'],P.request_department(r),detail={'object_name':r['resource_name'],'summary':'转审超级管理员'})
        return reload_request(s,tenant_id,p,r['id'])

def legacy_decide(s,tenant_id,current_user,p,r,decision,comment):
    """Original publish-approval execution (agent/skill publish requests)."""
    state={'return':'returned','reject':'rejected'}.get(decision,'approved');result={}
    if decision=='approve':
        obj,owner=resource(s,tenant_id,r['kind'],r['resource_id'],True)
        if owner!=r['applicant_id']:raise Conflict('资源归属已变化，请重新提交')
        member(s,tenant_id,owner)
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
    approved=r['visibility'] if state=='approved' and r['visibility']!='private' else None
    s.execute(text('UPDATE rx_releases SET state=:state,reviewer_id=:u,comment=:c,result=CAST(:j AS jsonb),approved_visibility=:av,decided_at=now() WHERE id=:id'),dict(state=state,u=current_user.id,c=comment,j=json.dumps(result),av=approved,id=r['id']))
    audit(s,tenant_id,current_user.id,'release.'+decision,r['id'],P.request_department(r),result='failed' if state in ('failed','stale') else 'success',
          detail={'state':state,'object_name':r['resource_name'],'summary':{'approved':'通过发布','rejected':'驳回','returned':'退回'}.get(state,'发布失败')})
    return reload_request(s,tenant_id,p,r['id'])

# ------------------------------------------------------------------ usage

@console_ns.route('/admin/usage')
class Usage(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        p=require(s,tenant_id,current_user.id,'ops.view')
        try:days=int(request.args.get('days','7'))
        except ValueError:days=0
        if days not in (7,30):raise BadRequest('时间范围只能是 7 天或 30 天')
        deps=all_departments(s,tenant_id);dnames={d['id']:d['name'] for d in deps}
        superuser=p['role']=='super_admin'
        listed=deps if superuser else [d for d in deps if d['id'] in p['head_department_ids']]
        wanted=request.args.get('department_id') or ''
        if wanted:
            if wanted not in dnames or (not superuser and wanted not in p['scope_ids']):raise NotFound('部门不存在或不在你的管理范围内')
            allowed=set(P.descendant_ids(deps,[wanted]))
        else:
            allowed=None if superuser else set(p['scope_ids'])
        primary=primary_departments(s,tenant_id)
        agents_=rows(s,"""SELECT CAST(a.id AS text) id,a.name,CAST(a.created_by AS text) owner_id,ac.name owner_name,CAST(a.app_id AS text) app_id
          FROM agents a LEFT JOIN accounts ac ON ac.id=a.created_by WHERE a.tenant_id=:t AND a.scope='roster' AND a.status='active'""",t=tenant_id)
        for a in agents_:a['department_id']=primary.get(a['owner_id'])
        if allowed is not None:agents_=[a for a in agents_ if a['department_id'] in allowed]
        from datetime import datetime,timedelta,timezone
        since=(datetime.now(timezone.utc)-timedelta(days=days)).replace(tzinfo=None)
        apps=[a['app_id'] for a in agents_ if a['app_id']]
        per_model={};per_app={};summary_callers=0
        if apps:
            params=dict(ids=apps,since=since)
            for r in s.execute(text("""SELECT CAST(app_id AS text) app_id,COALESCE(model_id,'') model,count(*) calls,COALESCE(sum(COALESCE(message_tokens,0)+COALESCE(answer_tokens,0)),0) tokens,max(created_at) last
              FROM messages WHERE app_id=ANY(CAST(:ids AS uuid[])) AND created_at>=:since GROUP BY app_id,model_id"""),params).mappings():
                per_model.setdefault(r['app_id'],[]).append(dict(r))
            for r in s.execute(text("""SELECT CAST(app_id AS text) app_id,count(DISTINCT COALESCE(CAST(from_account_id AS text),CAST(from_end_user_id AS text))) callers
              FROM messages WHERE app_id=ANY(CAST(:ids AS uuid[])) AND created_at>=:since GROUP BY app_id"""),params).mappings():
                per_app[r['app_id']]=r['callers']
            summary_callers=s.execute(text("""SELECT count(DISTINCT COALESCE(CAST(from_account_id AS text),CAST(from_end_user_id AS text))) FROM messages
              WHERE app_id=ANY(CAST(:ids AS uuid[])) AND created_at>=:since"""),params).scalar() or 0
        vis=Visibility(s,tenant_id);out=[]
        for a in agents_:
            models=per_model.get(a['app_id'],[])
            last=max((m['last'] for m in models if m['last']),default=None)
            out.append({'id':a['id'],'name':a['name'],'owner_name':a['owner_name'] or '','department_id':a['department_id'],'department_name':dnames.get(a['department_id']),
                'visibility':vis.scope('agent',a['id']),'calls':int(sum(m['calls'] for m in models)),'callers':int(per_app.get(a['app_id'],0)),
                'tokens':int(sum(m['tokens'] for m in models)),'models':sorted([{'model':m['model'] or '未知模型','tokens':int(m['tokens'])} for m in models],key=lambda x:-x['tokens']),
                'last_called_at':clean(last)})
        out.sort(key=lambda x:(-x['calls'],x['name']))
        return {'days':days,'departments':[{'id':d['id'],'name':d['name']} for d in listed],
            'summary':{'agents':len(out),'calls':sum(x['calls'] for x in out),'callers':int(summary_callers),'tokens':sum(x['tokens'] for x in out)},'agents':out}

# ------------------------------------------------------------------ audit

@console_ns.route('/admin/audit')
class Audit(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        p=require(s,tenant_id,current_user.id,'audit.view');a=request.args
        try:days=int(a.get('days') or 0)
        except ValueError:days=0
        where=" AND g.created_at>=now()-make_interval(days=>:days)" if days>0 else ''
        found=rows(s,f"""SELECT g.id,g.created_at,g.actor_id,g.action,g.object_id,g.department_id,g.result,g.detail,ac.name actor_name
          FROM rx_governance_audit g LEFT JOIN accounts ac ON CAST(ac.id AS text)=g.actor_id WHERE g.tenant_id=:t{where} ORDER BY g.id DESC LIMIT 5000""",t=tenant_id,days=days)
        dnames=dept_names(s,tenant_id);names=account_names(s,tenant_id);primary=primary_departments(s,tenant_id)
        releases={r['id']:r['resource_name'] for r in rows(s,'SELECT id,resource_name FROM rx_releases WHERE tenant_id=:t',t=tenant_id)}
        visible=[]
        for r in found:
            detail=r['detail'] or {};category=P.audit_category(r['action'],detail)
            if not category:continue
            if not P.audit_visible(p,r,[primary.get(r['actor_id'])] if primary.get(r['actor_id']) else []):continue
            obj=r['object_id']
            visible.append({'id':str(r['id']),'time':r['created_at'],'actor_name':r['actor_name'] or detail.get('actor_name') or '未知用户',
                'object_name':detail.get('object_name') or releases.get(obj) or dnames.get(obj) or names.get(obj) or detail.get('name') or '',
                'category':category,'summary':P.audit_summary(r['action'],detail),'department_id':r['department_id'],
                'department_name':dnames.get(r['department_id']),'result':r['result'] if r['result'] in ('success','denied','failed') else 'failed'})
        actors=sorted({x['actor_name'] for x in visible})
        department=a.get('department_id','') if p['role']=='super_admin' or a.get('department_id','') in p['scope_ids'] else ''
        data=[x for x in visible if P.audit_matches(x,a.get('actor',''),a.get('category',''),department,a.get('result',''),a.get('keyword','').strip())][:200]
        return {'data':[{k:v for k,v in x.items() if k!='department_id'} for x in data],'actors':actors,'categories':P.AUDIT_CATEGORIES}

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
