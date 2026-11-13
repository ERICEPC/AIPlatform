"""Single leased supervisor, one serialized consumer per channel, four runs globally."""
import asyncio
import json
import logging
import random
import time
from contextlib import suppress
from sqlalchemy import text
from . import store
from .common import ChannelError,unseal,fingerprint
from .runtime import ask,chunks
from .feishu import Feishu
from .dingtalk import DingTalk
from .wecom import WeCom
from .wechat import WeChat

ADAPTERS={'feishu':Feishu,'dingtalk':DingTalk,'wecom':WeCom,'wechat':WeChat}
log=logging.getLogger('channel_hub')


async def listener(c,adapter):
    failures=0
    while True:
        try:
            store.status(c,'connecting');await adapter.receive();failures=0
        except asyncio.CancelledError:raise
        except Exception as exc:
            code=exc.code if isinstance(exc,ChannelError) else 'offline'
            store.status(c,'offline',code)
            # No vendor payloads, credentials, URLs or message text in application logs.
            log.warning('channel=%s connector=%s error=%s type=%s',c['id'],c['kind'],code,type(exc).__name__)
        failures+=1;await asyncio.sleep(min(60,2**min(failures,6))+random.random())


async def consume(c,adapter,semaphore):
    while True:
        job=store.claim(c['id'])
        if not job:
            await asyncio.sleep(.5);continue
        started=time.monotonic();stage='runtime'
        try:
            if time.time()-job['created_at']>180:raise ChannelError('expired')
            event=unseal(c['tenant_id'],c['id'],job['payload'])
            async with semaphore:
                token=store.runtime(c)
                sessions=store.rows('SELECT conversation_id FROM raccoon_channel_sessions WHERE channel_id=:id AND conversation_key=:key',id=c['id'],key=job['conversation_key'])
                conversation=sessions[0]['conversation_id'] if sessions else ''
                # Bound total duration, including streamed responses that never terminate.
                if c.get('target_type') == 'team':
                    from team_hub.channels import ask_team
                    answer,conversation=await asyncio.wait_for(ask_team(c,job,event['text']),180)
                else:
                    answer,conversation=await asyncio.wait_for(ask(token,event['text'],'channel:'+job['conversation_key'],conversation),180)
                if conversation:
                    store.run('''INSERT INTO raccoon_channel_sessions(channel_id,conversation_key,conversation_id,updated_at)
                      VALUES(:id,:key,:conversation,:now) ON CONFLICT(channel_id,conversation_key)
                      DO UPDATE SET conversation_id=EXCLUDED.conversation_id,updated_at=EXCLUDED.updated_at''',
                      id=c['id'],key=job['conversation_key'],conversation=conversation,now=time.time())
            # Stop or rebind takes effect before delivery; never send through the next identity.
            store.runtime(c);stage='delivery'
            if c['kind']=='wecom':
                # One finished stream per incoming req_id; do not create multiple final replies.
                if len(answer.encode())>20000:raise ChannelError('too_long')
                await adapter.reply(event,answer,job['id'])
            else:
                for i,part in enumerate(chunks(answer)):
                    store.runtime(c)
                    await adapter.reply(event,part,fingerprint(job['id'],i)[:32])
            store.finish(job,'sent',duration=time.monotonic()-started)
        except asyncio.CancelledError:
            store.finish(job,'uncertain' if stage=='delivery' else 'failed','interrupted',time.monotonic()-started);raise
        except Exception as exc:
            code=exc.code if isinstance(exc,ChannelError) else stage
            store.finish(job,'uncertain' if stage=='delivery' else 'failed',code,time.monotonic()-started)
            log.warning('job=%s stage=%s error=%s type=%s',job['id'],stage,code,type(exc).__name__)


async def channel_tasks(c,semaphore):
    adapter=ADAPTERS[c['kind']](c)
    tasks=[asyncio.create_task(listener(c,adapter)),asyncio.create_task(consume(c,adapter,semaphore))]
    try:
        done,_=await asyncio.wait(tasks,return_when=asyncio.FIRST_COMPLETED)
        for task in done:task.result()
    finally:
        for task in tasks:task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)


async def main():
    # Session-scoped advisory lock prevents duplicate bot connections after rolling restarts.
    with store.engine().connect() as lease:
        if not lease.execute(text('SELECT pg_try_advisory_lock(732401924)')).scalar():
            raise RuntimeError('another channel worker is active')
        lease.commit()
        store.run("UPDATE raccoon_channel_jobs SET state='failed',error_code='interrupted',payload='',updated_at=:now WHERE state='running'",now=time.time())
        tasks={};semaphore=asyncio.Semaphore(4);cleanup_at=0
        try:
            while True:
                # A lost database session terminates this supervisor rather than working without a lease.
                lease.execute(text('SELECT 1'));lease.commit()
                active={r['id']:r['revision'] for r in store.rows('SELECT id,revision FROM raccoon_channels WHERE enabled=true')}
                for cid,(revision,task) in list(tasks.items()):
                    if active.get(cid)!=revision or task.done():
                        task.cancel();await asyncio.gather(task,return_exceptions=True);del tasks[cid]
                for cid,revision in active.items():
                    if cid not in tasks:
                        c=store.channel(cid);tasks[cid]=(revision,asyncio.create_task(channel_tasks(c,semaphore)))
                now=time.time()
                if now-cleanup_at>3600:
                    store.run("DELETE FROM raccoon_channel_jobs WHERE created_at<:cutoff AND state NOT IN ('pending','running')",cutoff=now-7*86400)
                    store.run("UPDATE raccoon_channel_jobs SET state='cancelled',payload='' WHERE state='pending' AND created_at<:cutoff",cutoff=now-300)
                    cleanup_at=now
                await asyncio.sleep(3)
        finally:
            for _,task in tasks.values():task.cancel()
            await asyncio.gather(*(t for _,t in tasks.values()),return_exceptions=True)


if __name__=='__main__':
    logging.basicConfig(level=logging.WARNING)
    for name in ('httpx','httpcore','websockets'):logging.getLogger(name).setLevel(logging.ERROR)
    asyncio.run(main())
