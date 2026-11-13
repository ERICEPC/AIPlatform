"""Pure OIDC helpers: PKCE, authorize URL, ID-token and session validation.

Only PyJWT/cryptography are needed; no Flask or database access.
"""
import base64
import hashlib
import hmac
import json
import secrets
from urllib.parse import quote, urlencode

import jwt

ALGORITHMS = ['RS256']
LEEWAY = 60


class OIDCError(Exception):
    """Validation failure; the message is safe to show to the user."""


def random_token(nbytes=32):
    return secrets.token_urlsafe(nbytes)


def new_verifier():
    # RFC 7636: 43-128 chars from the unreserved set.
    return secrets.token_urlsafe(64)[:96]


def pkce_challenge(verifier):
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')


def binding_hash(value):
    return hashlib.sha256((value or '').encode()).hexdigest()


def binding_matches(cookie_value, stored_hash):
    return bool(cookie_value and stored_hash) and hmac.compare_digest(binding_hash(cookie_value), stored_hash)


def authorize_url(endpoint, client_id, redirect_uri, scope, state, nonce, verifier):
    return endpoint + '?' + urlencode({
        'response_type': 'code', 'client_id': client_id, 'redirect_uri': redirect_uri, 'scope': scope,
        'state': state, 'nonce': nonce, 'code_challenge': pkce_challenge(verifier), 'code_challenge_method': 'S256',
    })


def basic_auth_header(client_id, client_secret):
    # RFC 6749 §2.3.1: form-encode both parts before Base64.
    raw = f"{quote(client_id, safe='')}:{quote(client_secret, safe='')}".encode()
    return 'Basic ' + base64.b64encode(raw).decode('ascii')


def safe_redirect(value, default='/new-ui/'):
    """Only same-origin relative paths (hash allowed)."""
    if not isinstance(value, str) or not value.startswith('/') or value.startswith('//') or '\\' in value:
        return default
    if any(ord(c) < 32 for c in value):
        return default
    return value


def error_redirect(redirect_url, message):
    base = safe_redirect(redirect_url).split('#', 1)[0].split('?', 1)[0] or '/new-ui/'
    return f"{base}#login?sso_error={quote(message, safe='')}"


def select_key(jwks, kid):
    keys = [k for k in (jwks or {}).get('keys', []) if k.get('kty') == 'RSA' and k.get('use', 'sig') == 'sig']
    if kid:
        keys = [k for k in keys if k.get('kid') == kid]
    if len(keys) != 1:
        raise OIDCError('身份令牌签名密钥无效')
    return jwt.PyJWK.from_dict(keys[0], algorithm='RS256').key


def validate_id_token(token, jwks, issuer, client_id, nonce, now=None):
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise OIDCError('身份令牌格式无效') from None
    if header.get('alg') not in ALGORITHMS:
        raise OIDCError('身份令牌签名算法不受支持')
    key = select_key(jwks, header.get('kid'))
    options = {'require': ['exp', 'iat', 'iss', 'aud', 'sub'], 'verify_iat': False}
    try:
        if now is not None:
            # Deterministic validation for tests: check exp manually against `now`.
            claims = jwt.decode(token, key, algorithms=ALGORITHMS, audience=client_id, issuer=issuer,
                                options={**options, 'verify_exp': False})
            if claims['exp'] + LEEWAY < now:
                raise OIDCError('身份令牌已过期')
        else:
            claims = jwt.decode(token, key, algorithms=ALGORITHMS, audience=client_id, issuer=issuer,
                                options=options, leeway=LEEWAY)
    except jwt.ExpiredSignatureError:
        raise OIDCError('身份令牌已过期') from None
    except jwt.InvalidAudienceError:
        raise OIDCError('身份令牌受众不匹配') from None
    except jwt.InvalidIssuerError:
        raise OIDCError('身份令牌签发方不匹配') from None
    except jwt.PyJWTError:
        raise OIDCError('身份令牌校验失败') from None
    if not nonce or not hmac.compare_digest(str(claims.get('nonce') or ''), nonce):
        raise OIDCError('身份令牌 nonce 不匹配')
    aud = claims.get('aud')
    if isinstance(aud, list) and len(aud) > 1 and claims.get('azp') not in (None, client_id):
        raise OIDCError('身份令牌受众不匹配')
    return claims


def check_session(payload, claims, issuer, client_id):
    """Validate GET {issuer}/v2/session against the ID token claims."""
    if not isinstance(payload, dict):
        raise OIDCError('统一身份会话无效')
    if not (payload.get('qualification') or {}).get('active'):
        raise OIDCError('统一身份账号未激活或已停用')
    if payload.get('sub') != claims.get('sub'):
        raise OIDCError('统一身份会话与登录用户不一致')
    tenant = claims.get('tenant_id')
    if tenant and payload.get('tenant_id') != tenant:
        raise OIDCError('统一身份会话租户不一致')
    if payload.get('issuer') and payload['issuer'].rstrip('/') != issuer.rstrip('/'):
        raise OIDCError('统一身份会话签发方不一致')
    aud = payload.get('aud')
    if aud and client_id not in (aud if isinstance(aud, list) else [aud]):
        raise OIDCError('统一身份会话受众不一致')
    return True


def session_active(payload, sub, tenant_id):
    """Lightweight periodic re-check (no ID token at hand)."""
    return (isinstance(payload, dict) and bool((payload.get('qualification') or {}).get('active'))
            and payload.get('sub') == sub and (not tenant_id or payload.get('tenant_id') == tenant_id))


def partner_open_id(issuer, tenant_id, sub):
    return hashlib.sha256(json.dumps([issuer, tenant_id or '', sub], separators=(',', ':')).encode()).hexdigest()
