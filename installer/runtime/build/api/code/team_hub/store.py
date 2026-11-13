import json
import time
from uuid import uuid4
from sqlalchemy import text
from werkzeug.exceptions import Conflict, NotFound, TooManyRequests, UnprocessableEntity
from channel_hub.store import engine, rows, run
from .contracts import digest


def team(tid, team_id, conn=None, lock=False):
    sql = 'SELECT * FROM raccoon_teams WHERE tenant_id=:tid AND id=:id AND deleted_at IS NULL' + (' FOR UPDATE' if lock else '')
    if conn is not None:
        result = conn.execute(text(sql), dict(tid=tid, id=team_id)).mappings().first()
    else:
        found = rows(sql, tid=tid, id=team_id)
        result = found[0] if found else None
    if result is None:
        raise NotFound('当前工作空间中不存在这个团队')
    return dict(result)


def version(tid, team_id, snapshot=None):
    t = team(tid, team_id)
    found = rows('SELECT * FROM raccoon_team_versions WHERE tenant_id=:tid AND team_id=:team AND id=:id',
                 tid=tid, team=team_id, id=snapshot or t['published_id'])
    if not found:
        raise NotFound('团队尚未发布，或指定版本不存在')
    return found[0]


def conversation(tid, team_id, cid, owner, source=None, conn=None):
    team(tid, team_id, conn)
    sql = '''SELECT id,query,answer,state,error_code,snapshot_id,config,source,conversation_id,
        turn_number,cancelled,created_at,started_at,finished_at FROM raccoon_team_runs WHERE tenant_id=:tid AND team_id=:team
        AND owner_key=:owner AND conversation_id=:cid ORDER BY turn_number'''
    params = dict(tid=tid, team=team_id, owner=owner, cid=cid)
    values = [dict(r) for r in conn.execute(text(sql), params).mappings()] if conn is not None else rows(sql, **params)
    if not values:
        # Existing standalone task URLs remain readable and can become the first
        # turn of a conversation when their owner explicitly continues them.
        legacy = sql.replace('conversation_id=:cid', 'id=:cid AND conversation_id IS NULL')
        values = [dict(r) for r in conn.execute(text(legacy), params).mappings()] if conn is not None else rows(legacy, **params)
        if values:
            values[0]['turn_number'] = 1
    if not values or (source is not None and values[0]['source'] != source):
        raise NotFound('对话不存在，或不属于当前账号和运行模式')
    return values


def conversations(tid, team_id, owner, source):
    team(tid, team_id)
    return rows('''SELECT first.id,first.query,first.snapshot_id,first.source,last.state,
        last.created_at,COALESCE(first.conversation_id,first.id) conversation_id,last.turn_number
        FROM raccoon_team_runs first JOIN LATERAL (
          SELECT state,created_at,turn_number FROM raccoon_team_runs
          WHERE tenant_id=:tid AND team_id=:team AND owner_key=:owner
          AND (conversation_id=first.conversation_id OR id=first.id) ORDER BY turn_number DESC NULLS LAST LIMIT 1
        ) last ON true WHERE first.tenant_id=:tid AND first.team_id=:team
        AND first.owner_key=:owner AND first.source=:source AND (first.turn_number=1 OR first.conversation_id IS NULL)
        ORDER BY last.created_at DESC LIMIT 50''', tid=tid, team=team_id, owner=owner, source=source)


def enqueue(tid, team_id, owner, source, query, request_key, snapshot_id, frozen, conversation_id=None, conversational=False):
    now = time.time()
    identity = [query, snapshot_id]
    if conversational or conversation_id:
        identity.extend([conversation_id, True])
    fingerprint = digest(json.dumps(identity, ensure_ascii=False))
    with engine().begin() as c:
        c.execute(text("SELECT pg_advisory_xact_lock(hashtext(:tid))"), dict(tid=tid))
        team(tid, team_id, c, True)
        old = c.execute(text('SELECT * FROM raccoon_team_runs WHERE team_id=:team AND owner_key=:owner AND request_key=:key'),
                        dict(team=team_id, owner=owner, key=request_key)).mappings().first()
        if old:
            if old['request_hash'] != fingerprint:
                raise Conflict('同一 Idempotency-Key 不能对应不同输入或版本')
            return dict(old)
        history = []
        turn = 1
        if conversation_id:
            previous = conversation(tid, team_id, conversation_id, owner, source, c)
            if any(r['state'] in ('queued', 'running') for r in previous):
                raise Conflict('当前对话正在回答，请等待完成或停止后再提问')
            first = previous[0]
            if snapshot_id != first['snapshot_id']:
                raise Conflict('同一对话需沿用开始时的版本；使用新配置请开启新对话')
            frozen = first['config']
            if first['conversation_id'] is None:
                c.execute(text('UPDATE raccoon_team_runs SET conversation_id=:cid,turn_number=1 WHERE id=:cid'), dict(cid=conversation_id))
            history = [dict(user=r['query'], assistant=r['answer'] if r['state'] == 'succeeded' else '',
                            state=r['state'], error_code=r['error_code']) for r in previous]
            if len(previous) >= 100 or len(json.dumps(history, ensure_ascii=False).encode()) > 80000:
                raise UnprocessableEntity('当前对话已达到上下文容量，请开启新对话并提供必要背景')
            turn = previous[-1]['turn_number'] + 1
        pending = c.execute(text("SELECT count(*) FROM raccoon_team_runs WHERE tenant_id=:tid AND state IN ('queued','running')"), dict(tid=tid)).scalar()
        if pending >= 20:
            raise TooManyRequests('团队任务队列已满，请稍后再试')
        rid = str(uuid4())
        cid = conversation_id or (rid if conversational else None)
        c.execute(text('''INSERT INTO raccoon_team_runs(id,tenant_id,team_id,owner_key,source,request_key,request_hash,query,snapshot_id,config,created_at,conversation_id,turn_number,context)
          VALUES(:id,:tid,:team,:owner,:source,:key,:hash,:query,:snapshot,CAST(:config AS jsonb),:now,:cid,:turn,CAST(:context AS jsonb))'''),
          dict(id=rid, tid=tid, team=team_id, owner=owner, source=source, key=request_key, hash=fingerprint,
               query=query, snapshot=snapshot_id, config=json.dumps(frozen, ensure_ascii=False), now=now,
               cid=cid, turn=turn if cid else None, context=json.dumps(history, ensure_ascii=False)))
        return dict(id=rid, state='queued', snapshot_id=snapshot_id, created_at=now, conversation_id=cid)


def get_run(tid, team_id, rid, owner=None):
    team(tid, team_id)
    found = rows('SELECT * FROM raccoon_team_runs WHERE tenant_id=:tid AND team_id=:team AND id=:id' + (' AND owner_key=:owner' if owner else ''),
                 tid=tid, team=team_id, id=rid, owner=owner)
    if not found:
        raise NotFound('任务不存在')
    value = found[0]
    value.pop('owner_key', None); value.pop('request_hash', None); value.pop('request_key', None)
    value.pop('context', None)
    value['steps'] = rows('''SELECT id,kind,agent_id,snapshot_id,round,task,state,result,error_code,conversation_id,message_id,started_at,finished_at
        FROM raccoon_team_steps WHERE run_id=:id ORDER BY started_at,id''', id=rid)
    return value


def cancel(tid, team_id, rid, owner=None):
    value = get_run(tid, team_id, rid, owner)
    run("""UPDATE raccoon_team_runs SET cancelled=true, state=CASE WHEN state='queued' THEN 'cancelled' ELSE state END,
        finished_at=CASE WHEN state='queued' THEN :now ELSE finished_at END WHERE id=:id AND state IN ('queued','running')""", id=rid, now=time.time())
    return value


def claim():
    with engine().begin() as c:
        found = c.execute(text("SELECT * FROM raccoon_team_runs WHERE state='queued' AND cancelled=false ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED")).mappings().first()
        if not found:
            return None
        c.execute(text("UPDATE raccoon_team_runs SET state='running',started_at=:now WHERE id=:id"), dict(id=found['id'], now=time.time()))
        return dict(found)
