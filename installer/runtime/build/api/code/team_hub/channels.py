"""Channels dispatch to the published Team without exposing an extra API key."""
import asyncio
import time
from . import store
from .contracts import TERMINAL
from channel_hub.common import ChannelError


async def ask_team(channel, job, query):
    v = store.version(channel['tenant_id'], channel['agent_id'])
    frozen = dict(v['config'], timeout=min(v['config']['timeout'], 150))
    value = store.enqueue(channel['tenant_id'], channel['agent_id'], 'channel:'+job['conversation_key'],
                          'channel', query, job['id'], v['id'], frozen)
    rid = value['id']
    try:
        while True:
            result = store.get_run(channel['tenant_id'], channel['agent_id'], rid)
            if result['state'] == 'succeeded':
                return result['answer'], ''
            if result['state'] in TERMINAL:
                raise ChannelError('runtime')
            await asyncio.sleep(1)
    except BaseException:
        store.cancel(channel['tenant_id'], channel['agent_id'], rid)
        raise
