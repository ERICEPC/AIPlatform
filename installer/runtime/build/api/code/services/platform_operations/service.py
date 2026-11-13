"""Operations read model. Authorization stays at the existing HTTP boundary.

Scopes are supplied by the existing governance policy; this service cannot widen
scope or commit a transaction. Query and response semantics are preserved.
"""


def get_operations(repository, tenant_id, p, days, scopes, ping_cache):
    clause,params=scopes['current']
    # Both historical and current ownership must remain in the administrator's scope.
    old,_=scopes['historical']
    values=dict(t=tenant_id,days=int(days),**params)
    from services.platform_operations.queries import call_metric_queries
    queries=call_metric_queries(clause,old)
    stats=repository.one(queries['stats'],**values)
    daily=repository.rows(queries['daily'],**values)
    apps=repository.rows(queries['apps'],**values)
    recent=repository.rows(queries['recent'],**values)
    rc,rp=scopes['releases']
    releases=repository.one(f"SELECT count(*) FILTER(WHERE state='pending') AS pending,count(*) FILTER(WHERE state='approved' AND decided_at>=now()-interval '30 days') AS approved_30d FROM rx_releases WHERE tenant_id=:t AND {rc}",t=tenant_id,**rp)
    mc='TRUE' if p['role']=='super_admin' else 'EXISTS(SELECT 1 FROM rx_department_members m WHERE m.tenant_id=CAST(j.tenant_id AS varchar) AND m.account_id=CAST(j.account_id AS varchar) AND m.department_id IN (SELECT jsonb_array_elements_text(CAST(:scopes AS jsonb))))'
    members=repository.scalar(f"SELECT count(DISTINCT j.account_id) FROM tenant_account_joins j JOIN accounts u ON u.id=j.account_id WHERE j.tenant_id=:t AND u.status='active' AND {mc}",dict(t=tenant_id,**params))
    health=[]
    if p['role']=='super_admin':
        repository.check_database();health.append({'name':'业务数据库','status':'healthy','detail':'实时连接正常'})
        try:
            healthy=bool(ping_cache())
        except Exception:healthy=False
        health.append({'name':'缓存与任务协调','status':'healthy' if healthy else 'unavailable','detail':'Redis 实时连接正常' if healthy else '连接异常，请检查服务'})
    return {'days':int(days),'stats':stats,'daily':daily,'apps':apps,'recent':recent,'releases':releases,'members':members,'health':health,'scope':'当前工作空间' if p['role']=='super_admin' else '授权部门及下级部门','metrics_note':'调用指标仅统计本阶段应用接入网关；原 Web、API、消息渠道继续在各 Agent 日志中查看。'}
