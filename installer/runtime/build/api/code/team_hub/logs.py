"""Console run listing with native-style filtering, sorting and pagination."""
import time

from . import store
from .contracts import TERMINAL
from .monitoring import SOURCES


def listing(tid, team_id, args):
    store.team(tid, team_id)
    try:
        page = int(args.get('page', '1'))
        limit = int(args.get('limit', '100'))
    except (ValueError, TypeError):
        raise ValueError('分页参数无效') from None
    if not 1 <= page <= 1000000 or not 1 <= limit <= 100:
        raise ValueError('每页最多 100 条，页码必须为正整数')
    period = args.get('period', 'allTime')
    source = args.get('source', 'all')
    state = args.get('state', 'all')
    sort = args.get('sort_by', 'created_at')
    order = args.get('sort_order', 'desc')
    keyword = args.get('keyword', '').strip()
    if period not in ('allTime', 'last7days', 'last30days') or source not in SOURCES:
        raise ValueError('筛选参数无效')
    if state not in TERMINAL | {'all', 'queued', 'running'} or len(keyword) > 200:
        raise ValueError('状态或搜索内容无效，搜索最多 200 字')
    if sort not in ('created_at', 'finished_at') or order not in ('asc', 'desc'):
        raise ValueError('排序参数无效')
    where = 'r.tenant_id=:tid AND r.team_id=:team'
    params = dict(tid=tid, team=team_id, source=source, state=state, limit=limit)
    if period != 'allTime':
        params['after'] = time.time() - (7 if period == 'last7days' else 30)*86400
        where += ' AND r.created_at>=:after'
    if source == 'other':
        where += " AND r.source NOT IN ('preview','console','api','channel')"
    elif source != 'all':
        where += ' AND r.source=:source'
    if state != 'all':
        where += ' AND r.state=:state'
    if keyword:
        # Literal substring search, not a user-provided SQL LIKE pattern.
        params['keyword'] = '%'+keyword.replace('!', '!!').replace('%', '!%').replace('_', '!_')+'%'
        where += " AND (r.query ILIKE :keyword ESCAPE '!' OR r.id ILIKE :keyword ESCAPE '!')"
    total = store.rows('SELECT count(*) total FROM raccoon_team_runs r WHERE '+where, **params)[0]['total']
    page = min(page, max(1, (total+limit-1)//limit))
    params['offset'] = (page-1)*limit
    # Field and direction are selected from the allowlists above. Values remain bound.
    runs = store.rows('''SELECT r.id,r.snapshot_id,r.source,left(r.query,150) query,r.state,r.error_code,
        r.created_at,r.started_at,r.finished_at,v.version published_version,
        (SELECT count(*) FROM raccoon_team_steps s WHERE s.run_id=r.id AND s.kind='expert') expert_calls
        FROM raccoon_team_runs r LEFT JOIN raccoon_team_versions v
            ON v.id=r.snapshot_id AND v.team_id=r.team_id AND v.tenant_id=r.tenant_id
        WHERE '''+where+' ORDER BY r.'+sort+' '+order+' NULLS LAST,r.id '+order+' LIMIT :limit OFFSET :offset', **params)
    return dict(runs=runs, total=total, page=page, limit=limit)
