"""Original tenant-bound permission queries, without caching or transaction ownership."""
from sqlalchemy import text
from services.platform_common.serialization import clean


class PermissionsRepository:
    def __init__(self, session):
        self.session = session

    def rows(self, sql, **params):
        return [clean(dict(row)) for row in self.session.execute(text(sql), params).mappings()]

    def assignment(self, tenant, user):
        return next(iter(self.rows('SELECT a.*,r.name,r.permissions FROM rx_admin_assignments a JOIN rx_admin_roles r ON r.tenant_id=a.tenant_id AND r.id=a.role_id WHERE a.tenant_id=:t AND a.account_id=:u',t=tenant,u=user)),None)

    def departments(self, tenant):
        return self.rows('SELECT id,parent_id FROM rx_departments WHERE tenant_id=:t',t=tenant)
