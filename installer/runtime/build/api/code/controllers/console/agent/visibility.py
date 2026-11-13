"""Workspace resource sharing policy. Public means this workspace, never the Internet.

Console ORM reads share one policy so list/count/detail selectors cannot disagree.
Background jobs retain their explicit execution identity; collaboration checks Member.public.
"""
from uuid import UUID
from flask import g, has_request_context, request
from flask_restx import Resource
from sqlalchemy import event, or_, select, text
from sqlalchemy.orm import Session, with_loader_criteria
from werkzeug.exceptions import Forbidden, NotFound, BadRequest
from controllers.console import bp, console_ns
from extensions.ext_database import db
from libs.login import current_user
from models.account import Account
from models.agent import Agent
from models.model import App
from models.skill import Skill
from models.tools import MCPToolProvider
from .personal import auth

MODELS = {'agent': (Agent, 'created_by'), 'skill': (Skill, 'created_by'), 'mcp': (MCPToolProvider, 'user_id')}

def principal():
    if not has_request_context() or not request.path.startswith('/console/api/') or getattr(g, '_resource_acl_resolving', False):
        return None
    g._resource_acl_resolving = True
    try:
        try:
            user = current_user._get_current_object()
        except Exception:
            return None
        return (user.id, user.current_tenant_id) if isinstance(user, Account) and user.current_tenant_id else None
    finally:
        g._resource_acl_resolving = False

def public_ids(session, tenant, kind):
    return list(session.execute(text('SELECT resource_id FROM resource_visibility WHERE tenant_id=:t AND kind=:k AND visibility=\'public\''), {'t':tenant,'k':kind}).scalars())

def accessible_ids(session, tenant, uid, kind):
    # Membership in a child department inherits a grant to its ancestor.
    shared = public_ids(session, tenant, kind)
    shared += list(session.execute(text("""WITH RECURSIVE ancestors(id,parent_id) AS (
      SELECT d.id,d.parent_id FROM rx_departments d JOIN rx_department_members m
      ON m.tenant_id=d.tenant_id AND m.department_id=d.id WHERE d.tenant_id=:t AND m.account_id=:u
      UNION SELECT d.id,d.parent_id FROM rx_departments d JOIN ancestors a ON a.parent_id=d.id WHERE d.tenant_id=:t)
      SELECT DISTINCT resource_id FROM rx_resource_departments WHERE tenant_id=:t AND kind=:k AND department_id IN(SELECT id FROM ancestors)"""), {'t':tenant,'u':uid,'k':kind}).scalars())
    return shared


def is_public(session, tenant, kind, rid):
    return session.execute(text('SELECT visibility FROM resource_visibility WHERE tenant_id=:t AND kind=:k AND resource_id=:r'), {'t':tenant,'k':kind,'r':rid}).scalar() == 'public'

def can_read(session, tenant, user_id, kind, row):
    return bool(row and row.tenant_id == tenant and (getattr(row, MODELS[kind][1]) == user_id or row.id in accessible_ids(session, tenant, user_id, kind)))

@event.listens_for(Session, 'do_orm_execute')
def filter_console_resources(state):
    if not state.is_select or state.execution_options.get('resource_acl_internal'):
        return
    who = principal()
    if not who:
        return
    uid, tenant = who
    uid = state.session.info.get('governance_execution_owner', uid)
    cache_key = (request._get_current_object(), uid, tenant)
    if getattr(g, '_resource_acl_cache_key', None) != cache_key:
        g._resource_acl_cache_key = cache_key
        # Text queries intentionally do not recurse through ORM resource criteria.
        g._resource_public_ids = {kind: accessible_ids(state.session, tenant, uid, kind) for kind in MODELS}
        g._resource_public_apps = list(state.session.execute(text("SELECT app_id FROM agents WHERE tenant_id=:t AND CAST(id AS text) IN (SELECT jsonb_array_elements_text(CAST(:ids AS jsonb)))"), {'t':tenant,'ids':__import__('json').dumps(g._resource_public_ids['agent'])}).scalars())
    options=[]
    for kind,(model,owner) in MODELS.items():
        options.append(with_loader_criteria(model, (model.tenant_id == tenant) & or_(getattr(model,owner)==uid,model.id.in_(g._resource_public_ids[kind])), include_aliases=True))
    # App-backed Agents are also addressable through generic /apps APIs.
    # Build against the entity supplied by SQLAlchemy so JOIN aliases receive
    # their own columns, not references to an absent base `apps` table.
    shared_app_ids = g._resource_public_apps
    options.append(with_loader_criteria(
        App,
        lambda app: or_(app.mode != 'agent', (app.tenant_id == tenant) & or_(app.created_by == uid, app.id.in_(shared_app_ids))),
        include_aliases=True,
    ))
    state.statement=state.statement.options(*options)

def raw_resource(session, tenant, kind, rid):
    model,_=MODELS[kind]
    stmt=select(model).where(model.tenant_id==tenant)
    if kind=='mcp':
        try:
            UUID(rid)
            stmt=stmt.where(or_(model.id==rid,model.server_identifier==rid))
        except ValueError:
            stmt=stmt.where(model.server_identifier==rid)
    else:
        stmt=stmt.where(model.id==rid)
    return session.scalar(stmt.execution_options(resource_acl_internal=True))

@bp.before_request
def guard_resource_mutations():
    who=principal()
    if not who:return
    uid,tenant=who
    args=request.view_args or {};body=request.get_json(silent=True) or {}
    if not isinstance(body, dict):body={}
    targets=[]
    for arg,kind in [('agent_id','agent'),('skill_id','skill')]:
        if args.get(arg):targets.append((kind,str(args[arg])))
    if '/tool-provider/mcp' in request.path or '/tools/mcp' in request.path:
        rid=args.get('provider_id') or body.get('provider_id')
        if rid:targets.append(('mcp',str(rid)))
    with Session(db.engine) as session:
        if args.get('app_id'):
            a=session.scalar(select(Agent).where(Agent.tenant_id==tenant,Agent.app_id==str(args['app_id'])).execution_options(resource_acl_internal=True))
            if a:targets.append(('agent',a.id))
        for kind,rid in targets:
            row=raw_resource(session,tenant,kind,rid)
            if not can_read(session,tenant,uid,kind,row):raise NotFound('资源不存在或仅创建者可见')
            owner=getattr(row,MODELS[kind][1])==uid
            copy=request.path.endswith(('/copy','/duplicate'))
            if request.method not in ('GET','HEAD','OPTIONS') and not owner and not copy:
                raise Forbidden('共享资源仅创建者可以修改；请复制到自己名下后配置')
            # Shared ability does not grant access to another employee's execution logs or secrets.
            if not owner and any(part in request.path for part in ('/logs','/statistics','/monitoring','/api-keys','/api-access','/sandbox','/build-draft','/access-tokens','/mcp/update/')):
                raise Forbidden('运行记录和管理配置仅创建者可查看')

def serialize(row, kind, uid, session, tenant):
    departments=list(session.execute(text('SELECT department_id FROM rx_resource_departments WHERE tenant_id=:t AND kind=:k AND resource_id=:r'), {'t':tenant,'k':kind,'r':row.id}).scalars())
    return {'id':row.id,'department_ids':departments,'visibility':'public' if is_public(session,tenant,kind,row.id) else 'department' if departments else 'private','can_manage':getattr(row,MODELS[kind][1])==uid,'owner_id':getattr(row,MODELS[kind][1])}

def can_view(session, tenant, user_id, kind, owner_id, rid):
    return owner_id == user_id or rid in accessible_ids(session, tenant, user_id, kind)

@console_ns.route('/resource-visibility/<string:kind>/<string:resource_id>')
class ResourceVisibility(Resource):
    """ResourceShare view for agent/team/skill/mcp. Widening goes through /resource-shares."""
    @auth
    def get(self,session,tenant_id,current_user,kind,resource_id):
        from .governance import resource_info, share_view
        from services.platform_governance.policy import KINDS
        if kind not in KINDS:raise BadRequest('无效资源类型')
        try:info=resource_info(session,tenant_id,kind,resource_id)
        except (NotFound, BadRequest):raise NotFound('资源不存在或仅创建者可见') from None
        if not can_view(session,tenant_id,current_user.id,kind,info['owner_id'],info['id']):raise NotFound('资源不存在或仅创建者可见')
        return share_view(session,tenant_id,current_user.id,kind,info)
    @auth
    def put(self,session,tenant_id,current_user,kind,resource_id):
        from .governance import make_private
        from services.platform_governance.policy import KINDS
        if kind not in KINDS:raise BadRequest('无效资源类型')
        value=(request.get_json(silent=True) or {}).get('visibility')
        if value!='private':raise BadRequest('扩大共享范围请提交共享申请，审批通过后生效')
        return make_private(session,tenant_id,current_user.id,kind,resource_id)
