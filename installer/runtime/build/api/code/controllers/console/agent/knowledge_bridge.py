"""Account- and tenant-scoped bridge to the documented Knowledge Base API.
Session cookies and explicitly authorized reconnect credentials are encrypted at rest.
"""
import fcntl
import base64
import hashlib
import json
import logging
import os
import re
import tempfile
import time
from uuid import UUID
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from cryptography.fernet import Fernet, InvalidToken
from flask import current_app, request, Response, stream_with_context
from flask_restx import Resource
from werkzeug.exceptions import BadRequest, Forbidden, ServiceUnavailable
from controllers.console import console_ns
from .personal import auth

# Include a deployment path prefix here only when the upstream uses one.
ORIGIN = os.environ.get('KNOWLEDGE_BRIDGE_BASE_URL', 'https://180.184.148.175/kb').rstrip('/')
AUTH_ORIGIN = os.environ.get('KNOWLEDGE_BRIDGE_AUTH_ORIGIN', 'https://partner.sensetime.com').rstrip('/')
ROOT = Path('/app/api/storage/knowledge-bridge')
logger = logging.getLogger(__name__)

class AuthLogFilter(logging.Filter):
    def filter(self, record):
        message = record.getMessage()
        return not ('HTTP Request:' in message and (AUTH_ORIGIN in message or '/admin/auth/oidc/' in message))

logging.getLogger('httpx').addFilter(AuthLogFilter())


def cookie_state(client):
    return [{'name': c.name, 'value': c.value, 'domain': c.domain, 'path': c.path} for c in client.cookies.jar if c.domain.lstrip('.') == urlparse(ORIGIN).hostname]



def cipher():
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(current_app.config['SECRET_KEY'].encode()).digest()))


def state_path(tenant, account):
    # Never accept a filesystem path or an identity from a browser payload.
    return ROOT / str(UUID(str(tenant))) / (str(UUID(str(account))) + '.enc')


def save(tenant, account, email, state):
    path = state_path(tenant, account)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    state = {**state, 'schema': 2, 'origin': ORIGIN, 'tenant_id': str(tenant),
             'account_id': str(account), 'email': email.strip().casefold()}
    payload = cipher().encrypt(json.dumps(state).encode())
    fd, temporary = tempfile.mkstemp(prefix='.session-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(payload)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def matches_identity(state, email):
    profile = state.get('profile', {})
    if not isinstance(profile, dict):
        return False
    # An upstream display name is not a verified login identifier.
    identity = profile.get('username') or profile.get('email') or profile.get('userId')
    return isinstance(identity, str) and identity.strip().casefold() == email.strip().casefold()


def load(tenant, account, email):
    path = state_path(tenant, account)
    legacy = False
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        # Adopt an old shared session ONLY for its actual account owner. Never
        # copy an administrator's cookies into a colleague's personal session.
        try:
            raw = (ROOT / (str(UUID(str(tenant))) + '.enc')).read_bytes()
            legacy = True
        except FileNotFoundError:
            raise ServiceUnavailable('请登录平台以自动连接本人的知识库。')
    try:
        state = json.loads(cipher().decrypt(raw))
        valid_scope = legacy or (state.get('tenant_id') == str(tenant)
                                and state.get('account_id') == str(account)
                                and state.get('email') == email.strip().casefold())
        if state.get('origin') != ORIGIN or not valid_scope or not matches_identity(state, email):
            raise ValueError('identity mismatch')
        return state
    except (InvalidToken, ValueError, TypeError, AttributeError, KeyError):
        raise ServiceUnavailable('知识库身份需要重新验证，请重新登录平台。') from None


def refresh_state(state, email):
    tenant, account = state.get('tenant_id'), state.get('account_id')
    if not tenant or not account:
        return _refresh_state(state, email)
    # Serialize renewal across API workers; reuse the latest persisted cookies.
    lock_path = state_path(tenant, account).with_suffix('.lock')
    with open(lock_path, 'a') as lock:
        os.chmod(lock_path, 0o600)
        deadline = time.monotonic() + 20
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise ServiceUnavailable('知识库连接正在恢复，请稍后刷新。')
                time.sleep(0.05)  # Cooperative under the API gevent workers.

        state = load(tenant, account, email)
        updated = _refresh_state(state, email)
        if updated:
            save(tenant, account, email, updated)
        return updated


def _refresh_state(state, email):
    with client_for(state) as client:
        response = client.get(ORIGIN + '/admin/auth/me', timeout=8)
        if response.status_code >= 500:
            raise ServiceUnavailable('知识库服务暂时不可用，请稍后重试。')
        if response.status_code == 401:
            return recover_session(state, email)
        if response.status_code != 200:
            return None
        try:
            body = response.json()
        except ValueError:
            raise ServiceUnavailable('知识库服务返回异常，请稍后重试。') from None
        if not isinstance(body, dict) or str(body.get('code')) != '0':
            return None
        updated = {**state, 'profile': body.get('data') or {}, 'cookies': cookie_state(client)}
        return updated if matches_identity(updated, email) else None


def recover_session(state, email):
    # Only a validated owner-scoped state may supply reconnect credentials.
    if not matches_identity(state, email):
        return None
    resumed = resume_sso(state, email)
    if resumed:
        return resumed
    password = state.get('auto_reconnect_password')
    if not isinstance(password, str) or not password:
        return None
    try:
        renewed = login(email, password)
    except BadRequest:
        return None  # Password changed / account revoked: never loop or bypass auth.
    if not matches_identity(renewed, email):
        return None
    return {**state, **renewed}


def connect_on_platform_login(account_id, email, tenant_ids, password):
    """Called only AFTER platform authentication; never retain the password.

    This is credential exchange for the existing upstream identity provider,
    not an assertion that the two systems already share an OIDC session.
    Upstream outages must not prevent a valid platform login.
    """
    try:
        state = None
        for tenant in tenant_ids:
            try:
                state = refresh_state(load(tenant, account_id, email), email)
            except ServiceUnavailable:
                continue
            if state:
                break
        if state is None:
            state = login(email, password)
        if not matches_identity(state, email):
            raise Forbidden('知识库返回的身份与平台账号不一致。')
        for tenant in tenant_ids:
            save(tenant, account_id, email, state)
        return {'connected': True, 'mode': 'personal'}
    except Exception:
        # Never log exceptions carrying upstream URLs, credentials or cookies.
        logger.warning('Knowledge identity exchange unavailable; platform login preserved')
        return {'connected': False, 'mode': 'personal', 'reason': 'connection_required'}


class Form(HTMLParser):
    def __init__(self):
        super().__init__()
        self.action = ''
        self.fields = {}
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'form': self.action = attrs.get('action', '')
        if tag == 'input' and attrs.get('name'): self.fields[attrs['name']] = attrs.get('value', '')


def login(username, password):
    with httpx.Client(timeout=8, follow_redirects=True) as client:
        url = ORIGIN + '/admin/auth/oidc/login?redirect=/materials'
        page = client.get(url)
        form = Form(); form.feed(page.text)
        action = urljoin(str(page.url), form.action)
        if (urlparse(action).scheme, urlparse(action).netloc) != (urlparse(AUTH_ORIGIN).scheme, urlparse(AUTH_ORIGIN).netloc) or not form.fields.get('csrf_token'):
            raise ServiceUnavailable('认证中心登录方式发生变化，请联系管理员。')
        form.fields.update(user_id=username, password=password)
        client.post(action, data=form.fields)
        client.get(url)
        profile = client.get(ORIGIN + '/admin/auth/me')
        try:
            body = profile.json()
        except ValueError:
            body = {}
        if profile.status_code != 200 or not isinstance(body, dict) or str(body.get('code')) != '0':
            raise BadRequest('知识库登录未成功，请检查账号、密码及产品访问权限。')
        data = body.get('data') or {}
        return {'cookies': cookie_state(client), 'sso_cookies': identity_cookies(client), 'profile': data}


def identity_cookies(client):
    host = urlparse(AUTH_ORIGIN).hostname
    return [{'name': c.name, 'value': c.value, 'domain': c.domain, 'path': c.path}
            for c in client.cookies.jar if c.domain.lstrip('.') == host]


def resume_sso(state, email):
    """Recover an expired product session using the same user's IdP session.

    No password retention, no form submission, and no service/admin identity.
    If the IdP asks for login again, leave the connection unauthenticated.
    """
    cookies = state.get('sso_cookies') or []
    if not cookies:
        return None
    with httpx.Client(timeout=8, follow_redirects=True) as client:
        for cookie in cookies:
            if cookie.get('domain', '').lstrip('.') == urlparse(AUTH_ORIGIN).hostname:
                client.cookies.set(**cookie)
        client.get(ORIGIN + '/admin/auth/oidc/login?redirect=/materials')
        response = client.get(ORIGIN + '/admin/auth/me')
        if response.status_code >= 500:
            raise ServiceUnavailable('知识库服务暂时不可用，请稍后重试。')
        if response.status_code != 200:
            return None
        try:
            body = response.json()
        except ValueError:
            return None
        if not isinstance(body, dict) or str(body.get('code')) != '0':
            return None
        updated = {**state, 'cookies': cookie_state(client),
                   'sso_cookies': identity_cookies(client), 'profile': body.get('data') or {}}
        return updated if matches_identity(updated, email) else None


def client_for(state):
    client = httpx.Client(timeout=httpx.Timeout(180, connect=15), follow_redirects=False)
    for cookie in state['cookies']:
        client.cookies.set(**cookie)
    context = state['profile'].get('publicSession', {}).get('requestContext')
    if context: client.headers['X-Raccoon-Context'] = context
    return client


@console_ns.route('/identity/context')
class IdentityContext(Resource):
    @auth
    def get(self, session, tenant_id, current_user):
        role = getattr(current_user.role, 'value', current_user.role)
        return {
            'account_id': current_user.id, 'email': current_user.email,
            'name': current_user.name, 'tenant_id': tenant_id, 'workspace_role': role,
            # Do not turn a workspace owner into a platform-wide super admin.
            'resource_policy': {'private': 'owner', 'public': 'workspace',
                                'management': 'owner', 'external_public_supported': False},
            'knowledge_identity': 'current_account',
        }


@console_ns.route('/knowledge-bridge/connection')
class Connection(Resource):
    @auth
    def get(self, session, tenant_id, current_user):
        identity = {'auto_reconnect': False, 'account': current_user.email, 'mode': 'personal',
                    'tenant_id': tenant_id, 'account_id': current_user.id}
        try:
            state = load(tenant_id, current_user.id, current_user.email)
            identity['auto_reconnect'] = bool(state.get('auto_reconnect_password'))
        except ServiceUnavailable:
            return {**identity, 'connected': False, 'reason': 'connection_required'}
        try:
            state = refresh_state(state, current_user.email)
        except (httpx.HTTPError, ServiceUnavailable):
            return {**identity, 'connected': False, 'reason': 'upstream_unavailable'}
        if not state:
            return {**identity, 'connected': False, 'reason': 'session_expired'}
        save(tenant_id, current_user.id, current_user.email, state)
        return {**identity, 'connected': True, 'displayName': state['profile'].get('displayName')}

    @auth
    def post(self, session, tenant_id, current_user):
        body = request.get_json(silent=True) or {}
        if not isinstance(body, dict):
            raise BadRequest('无效请求。')
        username = body.get('username', current_user.email)
        if not isinstance(username, str) or username.strip().casefold() != current_user.email.strip().casefold():
            raise Forbidden('只能连接当前平台账号本人的知识库。')
        if not isinstance(body.get('password'), str) or not body['password']:
            raise BadRequest('请输入当前账号的知识库密码。')
        try:
            state = login(current_user.email, body['password'])
        except httpx.HTTPError:
            raise ServiceUnavailable('知识库认证服务暂时无法访问。') from None
        if not matches_identity(state, current_user.email):
            raise Forbidden('知识库返回的身份与平台账号不一致。')
        if body.get('auto_reconnect') is True:
            state['auto_reconnect_password'] = body['password']
        save(tenant_id, current_user.id, current_user.email, state)
        return {'connected': True, 'account': current_user.email, 'mode': 'personal'}

    @auth
    def delete(self, session, tenant_id, current_user):
        state = load(tenant_id, current_user.id, current_user.email)
        state.pop('auto_reconnect_password', None)
        save(tenant_id, current_user.id, current_user.email, state)
        return {'auto_reconnect': False}


@console_ns.route('/knowledge-bridge/<path:path>')
class Bridge(Resource):
    @auth
    def dispatch(self, session, tenant_id, current_user, path):
        if '..' in path or '\\' in path:
            raise BadRequest('无效路径')
        state = refresh_state(load(tenant_id, current_user.id, current_user.email), current_user.email)
        if not state:
            return {'code': 'KB_AUTH_EXPIRED', 'message': '知识库身份验证未通过，请检查账号密码或访问权限。'}, 409
        save(tenant_id, current_user.id, current_user.email, state)
        if path == 'admin/auth/me' and request.method == 'GET':
            # Return only display fields, never authentication context or cookies.
            profile = state['profile']
            return {'code': '0', 'data': {key: profile.get(key) for key in ('userId', 'displayName', 'organizationName', 'roleName', 'permissions')}}
        routes = json.loads(Path('/app/api/knowledge-bridge-routes.json').read_text())
        allowed = any(method == request.method and re.fullmatch(re.sub(r'\\\{[^}]+\\\}', '[^/]+', re.escape(route)), path) for method, route in routes)
        if not allowed:
            return {'code': 'NOT_SUPPORTED', 'message': '知识库 API 暂未开放此操作，请在完整知识库中管理。'}, 422
        client = client_for(state)
        url = ORIGIN + '/api/integrations/v1/' + path
        headers = {'Accept': request.headers.get('Accept', '*/*')}
        kwargs = {'params': list(request.args.items(multi=True)), 'headers': headers}
        if request.files:
            kwargs['files'] = [(key, (f.filename, f.stream, f.mimetype)) for key, f in request.files.items(multi=True)]
            kwargs['data'] = request.form.to_dict()
        elif request.data:
            kwargs['content'] = request.data
            headers['Content-Type'] = request.content_type or 'application/json'
        try:
            upstream = client.send(client.build_request(request.method, url, **kwargs), stream=True)
        except httpx.HTTPError:
            client.close()
            raise ServiceUnavailable('知识库服务连接失败，请稍后重试；写入操作请先检查材料状态。')
        if 'set-cookie' in upstream.headers:
            state['cookies'] = cookie_state(client); save(tenant_id, current_user.id, current_user.email, state)
        if upstream.status_code == 401:
            upstream.close(); client.close()
            return {'code': 'KB_AUTH_EXPIRED', 'message': '知识库会话已过期，请重新登录平台自动连接，或验证当前账号。'}, 409
        out_headers = {key: upstream.headers[key] for key in ('content-type', 'content-disposition') if key in upstream.headers}
        out_headers.update({'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})
        def chunks():
            try:
                yield from upstream.iter_bytes()
            finally:
                upstream.close(); client.close()
        return Response(stream_with_context(chunks()), status=upstream.status_code, headers=out_headers)

    get = post = put = patch = delete = dispatch
