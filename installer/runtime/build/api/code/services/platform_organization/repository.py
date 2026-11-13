"""Tenant-bound read queries. Authorization and transaction ownership stay with caller."""
from sqlalchemy import text
from services.platform_common.serialization import clean


class OrganizationRepository:
    def __init__(self, session):
        self.session = session

    def rows(self, sql, **params):
        return [clean(dict(row)) for row in self.session.execute(text(sql), params).mappings()]

    def departments(self, tenant):
        return self.rows('SELECT id,name,parent_id FROM rx_departments WHERE tenant_id=:t ORDER BY name', t=tenant)

    def members(self, tenant):
        return self.rows('SELECT a.id,a.name,a.email,a.status,j.role AS workspace_role FROM accounts a JOIN tenant_account_joins j ON j.account_id=a.id WHERE j.tenant_id=:t ORDER BY a.name', t=tenant)

    def memberships(self, tenant):
        return self.rows('SELECT account_id,department_id FROM rx_department_members WHERE tenant_id=:t', t=tenant)

    def roles(self, tenant):
        # Preserve the original inner join: orphan assignments are not administrators.
        return self.rows('SELECT a.account_id,a.role_id FROM rx_admin_assignments a JOIN rx_admin_roles r ON r.tenant_id=a.tenant_id AND r.id=a.role_id WHERE a.tenant_id=:t', t=tenant)
