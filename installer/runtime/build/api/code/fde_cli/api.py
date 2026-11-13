"""Workspace-scoped personal device login. No SSH, admin key or console JWT is issued."""
import hashlib
import json
import logging
import secrets
import os
import time
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, make_response
from werkzeug.exceptions import BadRequest, Forbidden, Unauthorized, TooManyRequests, HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from extensions.ext_redis import redis_client as redis
from core.db.session_factory import session_factory
from models import Account, TenantAccountJoin, Tenant
from fde_cli.approval_store import ApprovalStore, uid
from contextlib import contextmanager
from libs.passport import PassportService
from libs.token import extract_console_cookie_token, check_csrf_token
from fde_cli.worker import execute

bp = Blueprint('fde_cli', __name__, url_prefix='/fde-cli/v1')
ORIGIN = os.environ.get('CONSOLE_WEB_URL', '').rstrip('/')
TOKEN_TTL = 7 * 86400
DEVICE_TTL = 600
PREFIX = 'fde:personal-cli:v1:'
PLATFORM_ADMINS = frozenset(x.strip() for x in os.environ.get('RACCOON_CLI_PLATFORM_ADMIN_IDS', '').split(',') if x.strip())
logger = logging.getLogger('fde_cli.audit')


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def obj():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise BadRequest('JSON object required')
    return value


def limit(tag, count, seconds):
    key = PREFIX + 'rate:' + tag
    # Atomic fixed window; no immortal counters if a worker exits mid-request.
    n = redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, key, seconds)
    if n > count:
        raise TooManyRequests('请求过于频繁，请稍后重试')


def workspace_name(workspace):
    with session_factory.create_session() as session:
        tenant = session.get(Tenant, workspace)
        if not tenant:
            raise Forbidden('空间不存在或不可用')
        return tenant.name


def allowed(account_id, workspace=None):
    workspace = uid(workspace)
    with session_factory.create_session() as session:
        account = session.get(Account, account_id)
        member = session.scalar(select(TenantAccountJoin).where(TenantAccountJoin.account_id == account_id, TenantAccountJoin.tenant_id == workspace))
        if not account or str(account.status) != 'active' or not member or str(member.role) not in ('owner', 'admin', 'editor', 'normal'):
            raise Forbidden('工作空间成员资格已失效')
        return dict(id=account.id, email=account.email, name=account.name, role=str(member.role))


@contextmanager
def approval_session():
    with session_factory.create_session() as session:
        if session.bind.dialect.name == 'postgresql':
            session.execute(text("SET LOCAL lock_timeout = '5s'"))
        yield session


@contextmanager
def grant_scope(grant, action=None):
    # PostgreSQL row lock is held through the native worker's commits. A revoker
    # waits for this operation; once revocation commits, no new operation admits.
    with session_factory.create_session() as session:
        if session.bind.dialect.name == 'postgresql':
            session.execute(text("SET LOCAL lock_timeout = '5s'"))
        store = ApprovalStore(session)
        account = allowed(grant['account_id'], grant['workspace_id'])
        row = store.check(grant['authorization_id'], account['id'], grant['workspace_id'],
            grant['project_id'], account['role'], action, lock=True)
        def recheck():
            if time.time() >= min(row['expires_at'], grant.get('expires_at', row['expires_at'])):
                raise Forbidden('授权已到期')
            current = allowed(account['id'], grant['workspace_id'])
            store.check(row['id'], account['id'], row['workspace_id'], row['project_id'], current['role'], action)
        recheck()
        yield row, recheck
        session.commit()


def browser_account(mutate=False, workspace=None):
    if request.headers.get('Authorization'):
        raise Unauthorized('请使用平台网页登录授权')
    token = extract_console_cookie_token(request)
    if not token:
        raise Unauthorized('请先登录平台')
    try:
        payload = PassportService().verify(token)
    except Exception:
        raise Unauthorized('网页登录已过期') from None
    account_id = payload.get('user_id')
    if not account_id or payload.get('token_source'):
        raise Unauthorized('无效的网页登录身份')
    if mutate:
        if request.headers.get('Origin') != ORIGIN:
            raise Forbidden('无效的请求来源')
        check_csrf_token(request, account_id)
    if account_id in PLATFORM_ADMINS:
        with session_factory.create_session() as session:
            account = session.get(Account, account_id)
            if not account or str(account.status) != 'active':
                raise Forbidden('平台账号已失效')
            return dict(id=account.id, email=account.email, name=account.name, role='platform_admin')
    return allowed(account_id, workspace)


def auth():
    header = request.headers.get('Authorization', '')
    if not header.startswith('Bearer fde_cli_') or len(header) > 256:
        raise Unauthorized('缺少个人 CLI 凭据，请执行 auth login')
    key = PREFIX + 'token:' + digest(header[7:])
    value = redis.get(key)
    if not value:
        raise Unauthorized('CLI 授权已过期或撤销，请重新登录')
    grant = json.loads(value)
    if not grant.get('authorization_id') or grant.get('expires_at', 0) <= time.time():
        raise Unauthorized('无效的授权范围或有效期')
    if request.headers.get('X-Raccoon-Project') != grant.get('project_id'):
        raise Forbidden('项目绑定不匹配，请升级 CLI 并使用原项目配置')
    account = allowed(grant['account_id'], grant['workspace_id'])
    with grant_scope(grant) as (row, _):
        grant['actions'] = row['effective_actions']
    return key, grant, account


@bp.before_request
def bounded_input():
    if request.content_length and request.content_length > 262144:
        raise BadRequest('请求超过 256KB')


@bp.after_request
def headers(response):
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Content-Security-Policy'] = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    return response


@bp.errorhandler(Exception)
def error(exc):
    if isinstance(exc, HTTPException):
        return jsonify(ok=False, error=exc.description), exc.code
    if isinstance(exc, DBAPIError) and (getattr(exc.orig, 'sqlstate', None) or getattr(exc.orig, 'pgcode', None)) in ('55P03', '40P01', '57014'):
        return jsonify(ok=False, error='授权状态正在变更或操作超时；写操作结果可能未知，请先核对，勿自动重试'), 503
    logger.exception('personal CLI server error')
    return jsonify(ok=False, error='服务执行失败，请联系管理员查看日志'), 500


@bp.post('/auth/start')
def start():
    limit('start:' + digest(request.remote_addr or 'unknown'), 15, 60)
    data = obj()
    requested = data.get('workspace')
    if not isinstance(requested,str) or not requested.strip():
        raise BadRequest('workspace is required; no default workspace')
    workspace = uid(requested)
    project = uid(data.get('project_id'))
    authorization_id = uid(data.get('authorization_id'))
    label = str(data.get('label', 'Codex CLI'))[:80]
    device, approval = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    code = secrets.token_hex(3).upper()
    state = dict(status='pending', label=label, code=code, workspace_id=workspace, project_id=project, authorization_id=authorization_id)
    key = PREFIX + 'device:' + digest(device)
    with redis.pipeline(transaction=True) as pipe:
        pipe.set(key, json.dumps(state), ex=DEVICE_TTL)
        pipe.set(PREFIX + 'approval:' + digest(approval), key, ex=DEVICE_TTL)
        pipe.execute()
    return jsonify(ok=True, data=dict(device_code=device, user_code=code, verification_uri=ORIGIN+'/fde-cli/v1/authorize?request='+approval, expires_in=DEVICE_TTL, interval=3))


def approval_state(code):
    if not isinstance(code, str) or len(code) > 100:
        raise BadRequest('无效请求')
    key = redis.get(PREFIX + 'approval:' + digest(code))
    value = redis.get(key) if key else None
    if not value:
        raise BadRequest('授权请求已过期，请重新发起登录')
    state = json.loads(value)
    if not all(state.get(k) for k in ('workspace_id','project_id','authorization_id')):
        raise BadRequest('旧登录事务缺少项目审批绑定，请升级 CLI 并重新登录')
    return key, state


@bp.get('/auth/context')
def context():
    _, state = approval_state(request.args.get('request'))
    account = browser_account(workspace=state.get('workspace_id'))
    workspace = state['workspace_id']
    with grant_scope(dict(state, account_id=account['id'])) as (row, _):
        return jsonify(ok=True, data=dict(account=account, workspace=workspace_name(workspace),
            workspace_id=workspace, label=state['label'], user_code=state['code'], status=state['status'],
            project_id=row['project_id'], project_name=row['project_name'], actions=row['effective_actions'],
            authorization_id=row['id'], expires_at=row['expires_at']))


@bp.post('/auth/approve')
def approve():
    data = obj()
    key, state = approval_state(data.get('request'))
    account = browser_account(mutate=True, workspace=state.get('workspace_id'))
    workspace = state['workspace_id']
    limit('approve:' + account['id'], 15, 60)
    with grant_scope(dict(state, account_id=account['id'])) as (row, recheck):
        token = 'fde_cli_' + secrets.token_urlsafe(32)
        expires = min(row['expires_at'], int(time.time()) + TOKEN_TTL)
        grant = dict(grant_id=secrets.token_hex(16), authorization_id=row['id'], project_id=row['project_id'],
            account_id=account['id'], workspace_id=workspace, expires_at=expires, label=state['label'])
        state.update(status='approved', token=token, grant=grant)
        token_key = PREFIX + 'token:' + digest(token)
        recheck()
        result = redis.eval("local v=redis.call('GET',KEYS[1]); if not v or cjson.decode(v).status~='pending' then return 0 end; local ttl=redis.call('TTL',KEYS[1]); if ttl<1 then return 0 end; redis.call('SET',KEYS[1],ARGV[1],'EX',ttl); redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]); return 1", 2, key, token_key, json.dumps(state), json.dumps(grant), max(1, expires-int(time.time())))
        if not result:
            raise BadRequest('请求已经处理或过期')
        try:
            with session_factory.create_session() as audit_session:
                ApprovalStore(audit_session).audit(row['id'], account['id'], 'token_issued', token_id=grant['grant_id'])
                audit_session.commit()
        except Exception:
            redis.delete(token_key, key)
            raise
    return jsonify(ok=True, data=dict(approved=True))


@bp.post('/auth/poll')
def poll():
    device = obj().get('device_code')
    if not isinstance(device, str) or len(device) > 100:
        raise BadRequest('无效请求')
    limit('poll:' + digest(device), 30, 60)
    key = PREFIX + 'device:' + digest(device)
    value = redis.eval("local v=redis.call('GET',KEYS[1]); if v and cjson.decode(v).status=='approved' then redis.call('DEL',KEYS[1]) end; return v", 1, key)
    if not value:
        raise BadRequest('授权请求已过期或已被领取，请重新登录')
    state = json.loads(value)
    if state['status'] == 'pending':
        return jsonify(ok=False, error='authorization_pending'), 202
    with grant_scope(state['grant']):
        return jsonify(ok=True, data=dict(token=state['token'], **state['grant']))


@bp.get('/auth/me')
def me():
    _, grant, account = auth()
    return jsonify(ok=True, data=dict(account=account, workspace_id=grant['workspace_id'], workspace=workspace_name(grant['workspace_id']), expires_at=grant['expires_at'], grant_id=grant.get('grant_id'), actions=grant['actions'], project_id=grant['project_id'], authorization_id=grant['authorization_id']))


@bp.post('/auth/logout')
def logout():
    key, _, _ = auth()
    redis.delete(key)
    return jsonify(ok=True, data=dict(revoked=True))


@bp.post('/agent')
def manage():
    _, grant, account = auth()
    limit('manage:' + account['id'], 60, 60)
    data = obj()
    workspace = grant['workspace_id']
    if data.get('workspace') != workspace:
        raise Forbidden('此 CLI 授权仅允许 ' + workspace_name(workspace))
    if data.get('action') not in ('doctor', 'list', 'get', 'create', 'configure', 'publish'):
        raise BadRequest('不允许的操作')
    if set(data) - {'workspace', 'action', 'id', 'spec', 'patch', 'revision', 'dry_run', 'note', 'project_id'}:
        raise BadRequest('不支持的参数')
    if data.get('project_id') != grant['project_id']:
        raise Forbidden('项目绑定不匹配')
    logger.info('request account=%s workspace=%s action=%s agent=%s', account['id'], workspace, data['action'], data.get('id'))
    operation_id = secrets.token_hex(16)
    worker_request = dict(data, workspace=workspace)
    def audit_operation(kind):
        with session_factory.create_session() as audit_session:
            ApprovalStore(audit_session).audit(grant['authorization_id'], account['id'], kind,
                operation_id=operation_id, action=data['action'], dry_run=bool(data.get('dry_run')),
                project_id=grant['project_id'], agent_id=data.get('id'),
                created_agent_id=worker_request.get('created_agent_id'))
            audit_session.commit()
    try:
        with grant_scope(grant, data['action']) as (_, recheck):
            audit_operation('operation_admitted')
            try:
                result = execute(worker_request, account_id=account['id'], allowed_workspaces={workspace}, allowed_roles=('owner', 'admin', 'editor', 'normal'), app_instance=current_app._get_current_object(), authorization_check=recheck)
            except Exception:
                # Native create can commit before a later configuration failure.
                # An error does NOT establish that no write happened.
                audit_operation('operation_result_unknown')
                raise
            audit_operation('operation_completed')
    except (ValueError, PermissionError) as exc:
        return jsonify(ok=False, error=str(exc), operation_id=operation_id,
            created_agent_id=worker_request.get('created_agent_id')), 409 if '版本不匹配' in str(exc) else 400
    result['operation_id'] = operation_id
    logger.info('success account=%s workspace=%s action=%s agent=%s', account['id'], workspace, data['action'], result.get('id'))
    if data['action'] == 'doctor':
        result['transport'] = 'personal-https'
    return jsonify(ok=True, data=result)


@bp.get('/authorize')
def page():
    return (Path(__file__).with_name('authorize.html').read_text(), 200, {'Content-Type':'text/html; charset=utf-8'})


@bp.get('/authorize.js')
def js():
    return (Path(__file__).with_name('authorize.js').read_text(), 200, {'Content-Type':'application/javascript'})


@bp.get('/authorize.css')
def css():
    return (Path(__file__).with_name('authorize.css').read_text(), 200, {'Content-Type':'text/css'})


@bp.get('/capabilities')
def capabilities():
    return jsonify(ok=True,data=dict(version='2.1.0',contract='raccoon-cli-v2',single_workspace=True,explicit_workspace_required=True,resource_scope_validation=True,actions=['doctor','list','get','create','configure','publish'],approval_required=True, project_binding_required=True, refresh=False,idempotency_keys=False))


from fde_cli.approval_routes import install
import sys
install(sys.modules[__name__])
