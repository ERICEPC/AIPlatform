"""Environment-backed configuration. Secrets are read lazily and never logged."""
import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_ISSUER = 'https://partner.sensetime.com/auth'
SCOPE = 'openid profile email offline_access'


@dataclass(frozen=True)
class PartnerAuthConfig:
    issuer: str
    client_id: str
    redirect_uri: str
    workspace_id: str
    secret_file: str
    has_inline_secret: bool
    allowed_tenants: tuple = ()

    @property
    def configured(self):
        return bool(self.issuer and self.client_id and self.redirect_uri and (self.has_inline_secret or self.secret_file))

    def tenant_allowed(self, tenant_id):
        return not self.allowed_tenants or (tenant_id or '') in self.allowed_tenants

    @property
    def authorize_endpoint(self):
        return f'{self.issuer}/oauth/authorize'

    @property
    def token_endpoint(self):
        return f'{self.issuer}/oauth/token'

    @property
    def jwks_uri(self):
        return f'{self.issuer}/.well-known/jwks.json'

    @property
    def session_endpoint(self):
        return f'{self.issuer}/v2/session'

    def client_secret(self):
        inline = os.environ.get('PARTNER_AUTH_CLIENT_SECRET', '')
        if inline:
            return inline
        if self.secret_file:
            try:
                return Path(self.secret_file).read_text().strip()
            except OSError:
                return ''
        return ''


def load_config(env=None):
    env = os.environ if env is None else env
    return PartnerAuthConfig(
        issuer=(env.get('PARTNER_AUTH_ISSUER') or DEFAULT_ISSUER).rstrip('/'),
        client_id=env.get('PARTNER_AUTH_CLIENT_ID', ''),
        redirect_uri=env.get('PARTNER_AUTH_REDIRECT_URI', ''),
        workspace_id=env.get('PARTNER_AUTH_WORKSPACE_ID', ''),
        secret_file=env.get('PARTNER_AUTH_CLIENT_SECRET_FILE', ''),
        has_inline_secret=bool(env.get('PARTNER_AUTH_CLIENT_SECRET')),
        # Auth has no client-level tenant allow-list; the product enforces it (guide §5a).
        allowed_tenants=tuple(t.strip() for t in env.get('PARTNER_AUTH_ALLOWED_TENANTS', '').split(',') if t.strip()),
    )
