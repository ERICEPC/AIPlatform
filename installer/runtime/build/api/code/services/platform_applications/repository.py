"""Read-only application queries. The caller owns authorization and transactions."""
import json
from sqlalchemy import text
from services.platform_common.serialization import clean


class ApplicationsRepository:
    def __init__(self, session):
        self.session = session

    def rows(self, sql, **params):
        return [clean(dict(row)) for row in self.session.execute(text(sql), params).mappings()]

    def list_visible(self, tenant_id, scope_clause, scope_params):
        # scope_clause is generated internally by governance, never by request input.
        return self.rows(
            f'SELECT * FROM rx_integrations WHERE tenant_id=:t AND {scope_clause} ORDER BY created_at DESC',
            t=tenant_id, **scope_params)

    def active_keys(self, app_ids):
        if not app_ids:
            return []
        return self.rows(
            "SELECT app_id,hint,expires_at,created_at FROM rx_integration_keys "
            "WHERE app_id IN (SELECT jsonb_array_elements_text(CAST(:ids AS jsonb))) "
            "AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC",
            ids=json.dumps(app_ids))

    def recent_calls(self, app_ids):
        if not app_ids:
            return []
        return self.rows(
            "SELECT app_id,count(*) AS calls_7d,max(created_at) AS last_call, "
            "count(*) FILTER(WHERE status>=400) AS errors_7d FROM rx_integration_calls "
            "WHERE app_id IN (SELECT jsonb_array_elements_text(CAST(:ids AS jsonb))) "
            "AND created_at>=now()-interval '7 days' GROUP BY app_id",
            ids=json.dumps(app_ids))
