import json
import os
import time
from uuid import uuid4
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from .common import seal, unseal, fingerprint, allowed, ChannelError

_engine = None


def engine():
    global _engine
    if _engine is None:
        url = URL.create("postgresql+psycopg2", username=os.environ["DB_USERNAME"], password=os.environ["DB_PASSWORD"],
                         host=os.environ["DB_HOST"], port=int(os.environ.get("DB_PORT", 5432)), database=os.environ["DB_DATABASE"])
        _engine = create_engine(url, pool_size=4, max_overflow=2, pool_pre_ping=True, hide_parameters=True)
    return _engine


def rows(sql, **params):
    with engine().begin() as conn:
        return [dict(r) for r in conn.execute(text(sql), params).mappings()]


def run(sql, **params):
    with engine().begin() as conn:
        return conn.execute(text(sql), params).rowcount


def channel(cid):
    found = rows("SELECT * FROM raccoon_channels WHERE id=:id", id=cid)
    if not found:
        raise ChannelError("configuration")
    result = found[0]
    result["settings"] = json.loads(result["settings"])
    result["credentials"] = unseal(result["tenant_id"], result["id"], result["credentials"])
    return result


def status(c, value, error=""):
    run("UPDATE raccoon_channels SET status=:s,error_code=:e,status_at=:now WHERE id=:id AND revision=:rev AND enabled=true",
        id=c["id"], rev=c["revision"], s=value, e=error, now=time.time())


def ingest(c, event):
    """Persist and deduplicate before acknowledging the vendor event. Never execute in the callback."""
    if not event or not event.get("id") or not event.get("user"):
        return
    policy = c["settings"]
    now = time.time()
    key = fingerprint(c["tenant_id"], c["id"], c["agent_id"], event["user"], event.get("chat", ""))
    code = ""
    if not allowed(policy, event["user"], event.get("chat", ""), event.get("group", False)):
        code = "denied"
    elif not event.get("text"):
        code = "unsupported"
    elif len(event["text"].encode()) > 32000:
        code = "too_long"
    elif event.get("created", now) < now - 300:
        code = "expired"
    with engine().begin() as conn:
        active = conn.execute(text("SELECT enabled,revision FROM raccoon_channels WHERE id=:id FOR UPDATE"), {"id": c["id"]}).mappings().first()
        if not active or not active["enabled"] or active["revision"] != c["revision"]:
            raise ChannelError("configuration")
        pending = conn.execute(text("SELECT count(*) FROM raccoon_channel_jobs WHERE channel_id=:id AND state='pending'"), {"id":c["id"]}).scalar()
        if pending >= 100:
            code = "busy"
        # Retain only routing metadata on rejected messages, never their content.
        payload = event if not code else {"user": event["user"], "chat": event.get("chat", "")}
        conn.execute(text("""INSERT INTO raccoon_channel_jobs
          (id,channel_id,tenant_id,revision,event_key,conversation_key,payload,state,error_code,created_at,updated_at)
          VALUES(:id,:cid,:tid,:rev,:ek,:ck,:payload,:state,:code,:now,:now)
          ON CONFLICT(channel_id,event_key) DO NOTHING"""),
          dict(id=str(uuid4()), cid=c["id"],tid=c["tenant_id"],rev=c["revision"],ek=fingerprint(str(event["id"])),ck=key,
               payload=seal(c["tenant_id"],c["id"],payload),state="rejected" if code else "pending",code=code,now=now))


def claim(cid):
    with engine().begin() as conn:
        job = conn.execute(text("""SELECT j.* FROM raccoon_channel_jobs j JOIN raccoon_channels c ON c.id=j.channel_id
         WHERE j.channel_id=:id AND j.state='pending' AND c.enabled=true AND j.revision=c.revision
         ORDER BY j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED"""), {"id":cid}).mappings().first()
        if not job:
            return None
        conn.execute(text("UPDATE raccoon_channel_jobs SET state='running',updated_at=:now WHERE id=:id"), dict(id=job["id"],now=time.time()))
        return dict(job)


def finish(job, state, code="", duration=None):
    # Keep encrypted sender/chat identifiers for configuring access, but remove all content and reply credentials.
    event=unseal(job['tenant_id'],job['channel_id'],job['payload']) if job.get('payload') else {}
    routing=seal(job['tenant_id'],job['channel_id'],{k:event.get(k,'') for k in ('user','chat')})
    run("UPDATE raccoon_channel_jobs SET state=:s,error_code=:e,duration=:d,payload=:p,updated_at=:now WHERE id=:id",
        id=job["id"],s=state,e=code,d=duration,p=routing,now=time.time())


def runtime(c):
    if c.get('target_type') == 'team':
        value = rows("""SELECT t.id FROM raccoon_channels c JOIN raccoon_teams t
            ON t.id=c.agent_id AND t.tenant_id=c.tenant_id
            WHERE c.id=:id AND c.enabled=true AND c.revision=:rev AND t.published_id IS NOT NULL""", id=c['id'],rev=c['revision'])
        if not value:
            raise ChannelError('configuration')
        return None
    value = rows("""SELECT t.token FROM raccoon_channels c
      JOIN agents a ON CAST(a.id AS text)=c.agent_id AND CAST(a.tenant_id AS text)=c.tenant_id
      JOIN apps app ON app.id=COALESCE(a.backing_app_id,a.app_id)
      JOIN api_tokens t ON CAST(t.id AS text)=c.token_id AND t.app_id=app.id AND t.type='app'
      WHERE c.id=:id AND c.enabled=true AND c.revision=:rev AND app.enable_api=true
      AND a.status='active' AND a.active_config_snapshot_id IS NOT NULL""", id=c["id"],rev=c["revision"])
    if not value:
        raise ChannelError("configuration")
    return value[0]["token"]
