"""Read-only Team analytics; aggregate the full date range, never a log page."""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from . import store

SOURCES = {'all', 'preview', 'console', 'api', 'channel', 'other'}


def period(args):
    try:
        start = date.fromisoformat(args.get('start', ''))
        end = date.fromisoformat(args.get('end', ''))
        tz = ZoneInfo(args.get('timezone', 'UTC'))
    except (ValueError, TypeError, ZoneInfoNotFoundError):
        raise ValueError('请选择有效的日期范围和时区') from None
    if not 0 <= (end-start).days <= 30:
        raise ValueError('日期范围最多为 31 天，结束日期不能早于开始日期')
    source = args.get('source', 'all')
    if source not in SOURCES:
        raise ValueError('调用来源无效')
    return start, end, tz, source


def summary(tid, team_id, args):
    store.team(tid, team_id)
    start, end, tz, source = period(args)
    filters = ''
    if source == 'other':
        filters = " AND source NOT IN ('preview','console','api','channel')"
    elif source != 'all':
        filters = ' AND source=:source'
    values = store.rows('''WITH selected AS MATERIALIZED (
        SELECT id,state,created_at,started_at,finished_at,
            to_char(to_timestamp(created_at) AT TIME ZONE :timezone,'YYYY-MM-DD') AS bucket_day
        FROM raccoon_team_runs
        WHERE tenant_id=:tid AND team_id=:team AND created_at>=:start AND created_at<:end
        '''+filters+'''
    ), steps AS (
        SELECT s.run_id,count(*) model_calls,count(*) FILTER (WHERE s.kind='expert') expert_calls
        FROM raccoon_team_steps s JOIN selected r ON r.id=s.run_id GROUP BY s.run_id
    ), message_refs AS (
        SELECT DISTINCT s.run_id,CASE WHEN s.message_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN CAST(s.message_id AS uuid) END message_id
        FROM raccoon_team_steps s JOIN selected r ON r.id=s.run_id
    ), usage AS (
        SELECT ref.run_id,count(*) recorded_calls,
            sum(COALESCE(m.message_tokens,0)+COALESCE(m.answer_tokens,0)) tokens
        FROM message_refs ref JOIN messages m ON m.id=ref.message_id
        JOIN apps a ON a.id=m.app_id AND a.tenant_id=CAST(:tid AS uuid)
        WHERE COALESCE(m.message_tokens,0)+COALESCE(m.answer_tokens,0)>0
        GROUP BY ref.run_id
    ) SELECT r.bucket_day AS date,count(*) total,
        count(*) FILTER (WHERE r.state='queued') queued,
        count(*) FILTER (WHERE r.state='running') running,
        count(*) FILTER (WHERE r.state='succeeded') succeeded,
        count(*) FILTER (WHERE r.state='failed') failed,
        count(*) FILTER (WHERE r.state='timed_out') timed_out,
        count(*) FILTER (WHERE r.state='interrupted') interrupted,
        count(*) FILTER (WHERE r.state='cancelled') cancelled,
        avg(GREATEST(0,r.finished_at-r.created_at)) FILTER
            (WHERE r.state='succeeded' AND r.finished_at IS NOT NULL) avg_latency,
        avg(GREATEST(0,r.started_at-r.created_at)) FILTER
            (WHERE r.started_at IS NOT NULL) avg_queue,
        COALESCE(sum(s.model_calls),0) model_calls,
        COALESCE(sum(s.expert_calls),0) expert_calls,
        COALESCE(sum(u.recorded_calls),0) recorded_calls,
        COALESCE(sum(u.tokens),0) total_tokens
        FROM selected r LEFT JOIN steps s ON s.run_id=r.id LEFT JOIN usage u ON u.run_id=r.id
        GROUP BY GROUPING SETS ((r.bucket_day),()) ORDER BY r.bucket_day
    ''', tid=tid, team=team_id, source=source, timezone=tz.key,
        start=datetime.combine(start, time.min, tz).timestamp(),
        end=datetime.combine(end+timedelta(days=1), time.min, tz).timestamp())

    def clean(row):
        result = {k: (round(float(v), 2) if k in ('avg_latency', 'avg_queue') and v is not None
                       else int(v) if v is not None else None)
                  for k, v in row.items() if k != 'date'}
        completed = sum(result[k] for k in ('succeeded', 'failed', 'timed_out', 'interrupted'))
        result['success_rate'] = round(100*result['succeeded']/completed, 2) if completed else None
        # Unreported model usage is unknown, not zero cost.
        if result['model_calls'] and not result['recorded_calls']:
            result['total_tokens'] = None
        return result

    totals = clean(next(row for row in values if row['date'] is None))
    by_day = {row['date']: clean(row) for row in values if row['date'] is not None}
    empty = dict.fromkeys(totals, 0)
    empty.update(avg_latency=None, avg_queue=None, success_rate=None)
    days = [start+timedelta(days=i) for i in range((end-start).days+1)]
    return dict(summary=totals, daily=[dict(date=d.isoformat(), **by_day.get(d.isoformat(), empty)) for d in days],
                timezone=tz.key, source=source)
