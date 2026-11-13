import base64
import hashlib
import json
import time

import pytest

jwt = pytest.importorskip('jwt')
pytest.importorskip('cryptography')
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402

from services.partner_auth import oidc  # noqa: E402
from services.partner_auth.config import load_config  # noqa: E402

ISSUER = 'https://partner.sensetime.com/auth'
CLIENT = 'raccoonx-console'


@pytest.fixture(scope='module')
def keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    jwk.update(kid='k1', use='sig', alg='RS256')
    return key, {'keys': [jwk]}


def token(key, **overrides):
    now = int(time.time())
    claims = {'iss': ISSUER, 'aud': CLIENT, 'sub': 'u-1', 'tenant_id': 't-1', 'iat': now, 'exp': now + 300, 'nonce': 'n-1'}
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm='RS256', headers={'kid': 'k1'})


def test_pkce_s256_rfc7636_vector():
    verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    assert oidc.pkce_challenge(verifier) == 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    v = oidc.new_verifier()
    assert 43 <= len(v) <= 128
    expected = base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).rstrip(b'=').decode()
    assert oidc.pkce_challenge(v) == expected


def test_authorize_url_and_basic_auth():
    url = oidc.authorize_url(f'{ISSUER}/oauth/authorize', CLIENT, 'https://app/cb', 'openid profile email offline_access', 's', 'n', 'v' * 50)
    assert url.startswith(f'{ISSUER}/oauth/authorize?')
    assert 'code_challenge_method=S256' in url and 'state=s' in url and 'nonce=n' in url and 'v' * 50 not in url
    header = oidc.basic_auth_header('a b', 'p:w')
    assert base64.b64decode(header.split()[1]).decode() == 'a%20b:p%3Aw'


def test_valid_id_token(keypair):
    key, jwks = keypair
    claims = oidc.validate_id_token(token(key), jwks, ISSUER, CLIENT, 'n-1')
    assert claims['sub'] == 'u-1'
    claims = oidc.validate_id_token(token(key, aud=[CLIENT, 'other'], azp=CLIENT), jwks, ISSUER, CLIENT, 'n-1')
    assert claims['tenant_id'] == 't-1'


@pytest.mark.parametrize('overrides,message', [
    ({'iss': 'https://evil/auth'}, '签发方'),
    ({'aud': 'someone-else'}, '受众'),
    ({'nonce': 'other'}, 'nonce'),
    ({'nonce': None}, 'nonce'),
    ({'exp': int(time.time()) - 3600}, '过期'),
])
def test_invalid_id_tokens(keypair, overrides, message):
    key, jwks = keypair
    with pytest.raises(oidc.OIDCError, match=message):
        oidc.validate_id_token(token(key, **overrides), jwks, ISSUER, CLIENT, 'n-1')


def test_rejects_non_rs256_and_unknown_key(keypair):
    key, jwks = keypair
    hs = jwt.encode({'iss': ISSUER, 'aud': CLIENT, 'sub': 'u', 'exp': int(time.time()) + 60, 'iat': int(time.time()), 'nonce': 'n-1'},
                    'secret-secret-secret-secret-secret!', algorithm='HS256')
    with pytest.raises(oidc.OIDCError, match='算法'):
        oidc.validate_id_token(hs, jwks, ISSUER, CLIENT, 'n-1')
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(oidc.OIDCError):
        oidc.validate_id_token(token(other), jwks, ISSUER, CLIENT, 'n-1')  # bad signature, same kid
    with pytest.raises(oidc.OIDCError, match='密钥'):
        oidc.validate_id_token(token(key), {'keys': []}, ISSUER, CLIENT, 'n-1')


def test_deterministic_now(keypair):
    key, jwks = keypair
    t = token(key, exp=1000, iat=900)
    assert oidc.validate_id_token(t, jwks, ISSUER, CLIENT, 'n-1', now=1000)['sub'] == 'u-1'
    with pytest.raises(oidc.OIDCError, match='过期'):
        oidc.validate_id_token(t, jwks, ISSUER, CLIENT, 'n-1', now=2000)


def test_session_checks():
    claims = {'sub': 'u-1', 'tenant_id': 't-1'}
    ok = {'issuer': ISSUER, 'aud': [CLIENT], 'sub': 'u-1', 'tenant_id': 't-1', 'session_id': 's', 'qualification': {'active': True}}
    assert oidc.check_session(ok, claims, ISSUER, CLIENT)
    for bad in ({**ok, 'qualification': {'active': False}}, {**ok, 'sub': 'u-2'}, {**ok, 'tenant_id': 't-2'},
                {**ok, 'issuer': 'https://evil'}, {**ok, 'aud': 'other'}, None):
        with pytest.raises(oidc.OIDCError):
            oidc.check_session(bad, claims, ISSUER, CLIENT)
    assert oidc.session_active(ok, 'u-1', 't-1')
    assert not oidc.session_active({**ok, 'qualification': {}}, 'u-1', 't-1')
    assert not oidc.session_active(None, 'u-1', 't-1')


def test_open_id_and_binding_and_redirects():
    a = oidc.partner_open_id(ISSUER, 't-1', 'u-1')
    assert len(a) == 64 and a == hashlib.sha256(json.dumps([ISSUER, 't-1', 'u-1'], separators=(',', ':')).encode()).hexdigest()
    assert a != oidc.partner_open_id(ISSUER, 't-2', 'u-1')
    b = oidc.random_token()
    assert oidc.binding_matches(b, oidc.binding_hash(b))
    assert not oidc.binding_matches('other', oidc.binding_hash(b)) and not oidc.binding_matches(None, oidc.binding_hash(b))
    assert oidc.safe_redirect('/new-ui/#admin/approvals') == '/new-ui/#admin/approvals'
    for bad in ('https://evil.com/', '//evil.com', '/\\evil', None, 'relative'):
        assert oidc.safe_redirect(bad) == '/new-ui/'
    assert oidc.error_redirect('/new-ui/#agents', '登录失败') == '/new-ui/#login?sso_error=%E7%99%BB%E5%BD%95%E5%A4%B1%E8%B4%A5'


def test_config_from_env(tmp_path):
    assert not load_config({}).configured
    assert load_config({}).issuer == ISSUER
    secret = tmp_path / 'secret'
    secret.write_text('s3cret\n')
    cfg = load_config({'PARTNER_AUTH_ISSUER': ISSUER + '/', 'PARTNER_AUTH_CLIENT_ID': CLIENT,
                       'PARTNER_AUTH_REDIRECT_URI': 'https://app/console/api/auth/partner/callback',
                       'PARTNER_AUTH_CLIENT_SECRET_FILE': str(secret)})
    assert cfg.configured and cfg.issuer == ISSUER
    assert cfg.token_endpoint == ISSUER + '/oauth/token' and cfg.jwks_uri == ISSUER + '/.well-known/jwks.json'
    assert cfg.session_endpoint == ISSUER + '/v2/session'
    assert 's3cret' not in repr(cfg)


def test_tenant_allow_list():
    from services.partner_auth.config import load_config
    open_cfg = load_config({'PARTNER_AUTH_CLIENT_ID': 'c'})
    assert open_cfg.tenant_allowed('anything')
    cfg = load_config({'PARTNER_AUTH_ALLOWED_TENANTS': 'sensetime-cni-ecosystem, other'})
    assert cfg.allowed_tenants == ('sensetime-cni-ecosystem', 'other')
    assert cfg.tenant_allowed('sensetime-cni-ecosystem')
    assert not cfg.tenant_allowed('foreign-tenant')
    assert not cfg.tenant_allowed(None)
