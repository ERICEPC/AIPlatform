"""Enterprise unified identity (shared Auth) login: OIDC code + PKCE, BFF mode.

The browser never sees partner tokens: they are kept in Redis keyed by account.
Accounts are linked through account_integrates(provider='partner_auth',
open_id=sha256([issuer, tenant_id, sub])). Secrets and tokens are never logged.
"""
import json
import logging
import time

import httpx
from flask import redirect, request
from flask_restx import Resource
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from werkzeug.exceptions import Unauthorized

from controllers.console import bp, console_ns
from extensions.ext_database import db
from extensions.ext_redis import redis_client
from libs.token import is_secure
from models.account import Account, AccountStatus, Tenant, TenantAccountJoin
from services.partner_auth.config import SCOPE, load_config
from services.partner_auth import oidc

logger = logging.getLogger(__name__)

PROVIDER = 'partner_auth'
BINDING_COOKIE = 'rx_partner_auth_binding'
COOKIE_PATH = '/console/api/auth/partner'
STATE_TTL = 600
SESSION_TTL = 30 * 24 * 3600
CHECK_INTERVAL = 60
HTTP_TIMEOUT = 10.0
_jwks_cache = {'at': 0.0, 'issuer': '', 'value': None}


def state_key(state):
    return f'partner_auth:state:{state}'


def account_key(account_id):
    return f'partner_auth:account:{account_id}'


def checked_key(account_id):
    return f'partner_auth:checked:{account_id}'


def fetch_jwks(cfg, force=False):
    now = time.time()
    if not force and _jwks_cache['value'] and _jwks_cache['issuer'] == cfg.issuer and now - _jwks_cache['at'] < 600:
        return _jwks_cache['value']
    r = httpx.get(cfg.jwks_uri, timeout=HTTP_TIMEOUT)
    r.raise_for_status()
    _jwks_cache.update(at=now, issuer=cfg.issuer, value=r.json())
    return _jwks_cache['value']


def token_request(cfg, data):
    r = httpx.post(cfg.token_endpoint, data=data, timeout=HTTP_TIMEOUT,
                   headers={'Authorization': oidc.basic_auth_header(cfg.client_id, cfg.client_secret()), 'Accept': 'application/json'})
    if r.status_code != 200:
        logger.warning('partner auth token endpoint returned %s', r.status_code)
        raise oidc.OIDCError('统一身份令牌交换失败')
    return r.json()


def fetch_session(cfg, access_token):
    r = httpx.get(cfg.session_endpoint, timeout=HTTP_TIMEOUT, headers={'Authorization': f'Bearer {access_token}', 'Accept': 'application/json'})
    if r.status_code in (401, 403):
        return None
    r.raise_for_status()
    return r.json()


def workspace(session, cfg):
    if cfg.workspace_id:
        tenant = session.get(Tenant, cfg.workspace_id)
    else:
        tenant = session.scalar(select(Tenant).order_by(Tenant.created_at.asc()).limit(1))
    if not tenant:
        raise oidc.OIDCError('平台工作空间未初始化')
    return tenant


def record_login(tenant_id, account, result, summary, actor_name=None):
    try:
        with Session(db.engine) as s:
            dept = None
            if account:
                dept = s.execute(text('SELECT department_id FROM rx_department_members WHERE tenant_id=:t AND account_id=:u ORDER BY department_id LIMIT 1'),
                                 {'t': tenant_id, 'u': str(account.id)}).scalar()
            name = account.name if account else (actor_name or '未知用户')
            s.execute(text('INSERT INTO rx_governance_audit(tenant_id,actor_id,action,object_id,department_id,result,detail) VALUES(:t,:u,:a,:o,:d,:r,CAST(:j AS jsonb))'),
                      dict(t=str(tenant_id), u=str(account.id) if account else '', a='login.success' if result == 'success' else 'login.failure',
                           o=str(account.id) if account else '', d=dept, r=result,
                           j=json.dumps({'object_name': name, 'actor_name': name, 'summary': summary, 'method': 'partner_auth'}, ensure_ascii=False)))
            s.commit()
    except Exception:
        logger.warning('partner auth login audit failed')


def provision(cfg, claims, bind_account_id=None):
    """Find, bind or create the platform account for a validated identity.

    Identities are never merged by e-mail (Auth guide). An existing account is linked only
    when its owner started the flow while signed in to that account (bind mode).
    """
    from services.account_service import AccountService, TenantService
    session = db.session()
    if not cfg.tenant_allowed(claims.get('tenant_id')):
        raise oidc.OIDCError('当前统一身份租户未开通本平台，请联系管理员')
    open_id = oidc.partner_open_id(cfg.issuer, claims.get('tenant_id'), claims['sub'])
    account = Account.get_by_openid(PROVIDER, open_id)
    if bind_account_id:
        target = session.get(Account, bind_account_id)
        if not target:
            raise oidc.OIDCError('待绑定的平台账号不存在，请重新登录后再绑定')
        if account and str(account.id) != str(target.id):
            raise oidc.OIDCError('该统一身份已绑定其他平台账号，请联系管理员')
        account = target
    email = (claims.get('email') or '').strip().lower()
    if not account and email and AccountService.get_account_by_email_with_case_fallback(email, session=session):
        raise oidc.OIDCError('该邮箱已有平台账号：请先用原账号登录，在「账号设置」中点击「绑定企业统一身份」')
    if not account:
        name = (claims.get('name') or claims.get('preferred_username') or email.split('@')[0] or '统一身份用户')[:255]
        account = AccountService.create_account(
            email=email or f'{open_id[:32]}@partner-auth.invalid', name=name, interface_language='zh-Hans',
            password=None, is_setup=True, session=session)
    if account.status in (AccountStatus.BANNED, AccountStatus.CLOSED):
        raise oidc.OIDCError('平台账号已停用，请联系管理员')
    AccountService.link_account_integrate(PROVIDER, open_id, account, session=session)
    tenant = workspace(session, cfg)
    joined = session.scalar(select(TenantAccountJoin).where(TenantAccountJoin.tenant_id == tenant.id, TenantAccountJoin.account_id == account.id))
    if not joined:
        # New members join without a department; super admins assign it on the platform.
        TenantService.create_tenant_member(tenant, account, session, role='normal')
    return account, tenant


@console_ns.route('/auth/partner/status')
class PartnerAuthStatus(Resource):
    def get(self):
        cfg = load_config()
        bound = False
        try:
            from controllers.console.agent.visibility import principal
            who = principal()
            if who:
                bound = bool(db.session.scalar(text("SELECT 1 FROM account_integrates WHERE provider=:p AND account_id=:a"),
                                               {'p': PROVIDER, 'a': str(who[0])}))
        except Exception:
            bound = False
        return {'configured': cfg.configured, 'issuer': cfg.issuer, 'bound': bound}


@console_ns.route('/auth/partner/login')
class PartnerAuthLogin(Resource):
    def get(self):
        cfg = load_config()
        if not cfg.configured:
            return {'message': '统一身份未配置'}, 503
        state, nonce, verifier, binding = oidc.random_token(), oidc.random_token(), oidc.new_verifier(), oidc.random_token()
        target = oidc.safe_redirect(request.args.get('redirect_url'))
        bind_account = None
        if request.args.get('bind') == '1':
            from controllers.console.agent.visibility import principal
            who = principal()
            if not who:
                return {'message': '请先登录平台账号，再绑定企业统一身份'}, 401
            bind_account = str(who[0])
        redis_client.setex(state_key(state), STATE_TTL, json.dumps(
            {'nonce': nonce, 'verifier': verifier, 'binding': oidc.binding_hash(binding), 'redirect': target, 'bind_account': bind_account}))
        response = redirect(oidc.authorize_url(cfg.authorize_endpoint, cfg.client_id, cfg.redirect_uri, SCOPE, state, nonce, verifier))
        response.set_cookie(BINDING_COOKIE, binding, max_age=STATE_TTL, path=COOKIE_PATH, httponly=True, samesite='Lax',
                            secure=is_secure() or cfg.redirect_uri.startswith('https://'))
        response.headers['Cache-Control'] = 'no-store'
        return response


@console_ns.route('/auth/partner/callback')
class PartnerAuthCallback(Resource):
    def get(self):
        cfg = load_config()
        state = request.args.get('state') or ''
        raw = redis_client.getdel(state_key(state)) if state else None
        stored = json.loads(raw) if raw else {}
        target = stored.get('redirect') or '/new-ui/'
        tenant_id = None
        account = None

        def fail(message, name=None):
            if tenant_id:
                record_login(tenant_id, account, 'failed', f'企业统一身份登录失败：{message}', name)
            response = redirect(oidc.error_redirect(target, message))
            response.delete_cookie(BINDING_COOKIE, path=COOKIE_PATH)
            return response

        try:
            tenant_id = str(workspace(db.session(), cfg).id) if cfg.configured else None
        except oidc.OIDCError:
            tenant_id = None
        if not cfg.configured:
            return fail('统一身份未配置')
        if not stored or not oidc.binding_matches(request.cookies.get(BINDING_COOKIE), stored.get('binding')):
            return fail('登录请求已失效，请重新登录')
        if request.args.get('error'):
            return fail('统一身份登录已取消或被拒绝')
        code = request.args.get('code')
        if not code:
            return fail('缺少授权码，请重新登录')
        claims = {}
        try:
            tokens = token_request(cfg, {'grant_type': 'authorization_code', 'code': code, 'redirect_uri': cfg.redirect_uri,
                                         'code_verifier': stored['verifier']})
            if not tokens.get('id_token') or not tokens.get('access_token'):
                raise oidc.OIDCError('统一身份未返回有效令牌')
            try:
                claims = oidc.validate_id_token(tokens['id_token'], fetch_jwks(cfg), cfg.issuer, cfg.client_id, stored['nonce'])
            except oidc.OIDCError as exc:
                if str(exc) != '身份令牌签名密钥无效':
                    raise
                # Key rotation: refetch JWKS once.
                claims = oidc.validate_id_token(tokens['id_token'], fetch_jwks(cfg, True), cfg.issuer, cfg.client_id, stored['nonce'])
            payload = fetch_session(cfg, tokens['access_token'])
            if payload is None:
                raise oidc.OIDCError('统一身份会话无效')
            oidc.check_session(payload, claims, cfg.issuer, cfg.client_id)
            account, tenant = provision(cfg, claims, stored.get('bind_account'))
            tenant_id = str(tenant.id)
        except oidc.OIDCError as exc:
            db.session.rollback()
            return fail(str(exc), claims.get('name') or claims.get('email'))
        except Exception:
            db.session.rollback()
            logger.exception('partner auth callback failed')
            return fail('统一身份登录失败，请稍后重试', claims.get('name') or claims.get('email'))
        redis_client.setex(account_key(account.id), SESSION_TTL, json.dumps({
            'access_token': tokens['access_token'], 'refresh_token': tokens.get('refresh_token') or '',
            'sub': claims['sub'], 'tenant_id': claims.get('tenant_id') or '', 'issuer': cfg.issuer}))
        redis_client.setex(checked_key(account.id), CHECK_INTERVAL, '1')
        record_login(tenant_id, account, 'success', '企业统一身份登录成功')
        from .oauth import _redirect_with_console_session
        response = _redirect_with_console_session(account, target)
        response.delete_cookie(BINDING_COOKIE, path=COOKIE_PATH)
        response.headers['Cache-Control'] = 'no-store'
        return response


def _refresh(cfg, record):
    if not record.get('refresh_token'):
        return None
    try:
        tokens = token_request(cfg, {'grant_type': 'refresh_token', 'refresh_token': record['refresh_token']})
    except Exception:
        return None
    if not tokens.get('access_token'):
        return None
    return {**record, 'access_token': tokens['access_token'], 'refresh_token': tokens.get('refresh_token') or record['refresh_token']}


@bp.before_request
def guard_partner_session():
    """Re-check the shared Auth session at most once a minute for partner logins."""
    if request.method == 'OPTIONS' or request.path.startswith(COOKIE_PATH):
        return
    cfg = load_config()
    if not cfg.configured:
        return
    from controllers.console.agent.visibility import principal
    who = principal()
    if not who:
        return
    uid = who[0]
    try:
        raw = redis_client.get(account_key(uid))
        if not raw or not redis_client.set(checked_key(uid), '1', ex=CHECK_INTERVAL, nx=True):
            return
        record = json.loads(raw)
        payload = fetch_session(cfg, record['access_token'])
        if payload is None:
            refreshed = _refresh(cfg, record)
            if refreshed:
                record = refreshed
                payload = fetch_session(cfg, record['access_token'])
                redis_client.setex(account_key(uid), SESSION_TTL, json.dumps(record))
    except Exception:
        # Transient Auth/Redis failure: keep the session, retry after the interval.
        logger.warning('partner auth session re-check unavailable')
        return
    if not oidc.session_active(payload, record.get('sub'), record.get('tenant_id')):
        redis_client.delete(account_key(uid))
        try:
            from services.account_service import AccountService
            account = db.session.get(Account, uid)
            if account:
                AccountService.logout(account=account)
        except Exception:
            logger.warning('partner auth logout cleanup failed')
        raise Unauthorized('统一身份会话已失效，请重新登录')
