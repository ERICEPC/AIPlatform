import asyncio
import json
import time
from uuid import uuid4
import websockets
from .common import ChannelError
from . import store


def normalize(frame):
    d=frame.get('body',{});text=d.get('text',{}).get('content','') if d.get('msgtype')=='text' else ''
    return dict(id=d.get('msgid',''),user=d.get('from',{}).get('userid',''),chat=d.get('chatid') or d.get('from',{}).get('userid',''),
                group=d.get('chattype')=='group',text=text,created=d.get('create_time',time.time()),req_id=frame.get('headers',{}).get('req_id',''))


class WeCom:
    def __init__(self,c):self.c=c;self.ws=None;self.pending={};self.authenticated=False

    async def command(self,cmd,body,req_id=None):
        if not self.ws:raise ChannelError('offline')
        rid=req_id or str(uuid4());future=asyncio.get_running_loop().create_future();self.pending[rid]=future
        try:
            await self.ws.send(json.dumps({'cmd':cmd,'headers':{'req_id':rid},'body':body}))
            result=await asyncio.wait_for(future,10)
            if result.get('errcode')!=0:raise ChannelError('credentials' if cmd=='aibot_subscribe' else 'delivery')
            return result
        finally:self.pending.pop(rid,None)

    async def keepalive(self):
        await self.command('aibot_subscribe',{'bot_id':self.c['credentials']['bot_id'],'secret':self.c['credentials']['secret']})
        self.authenticated=True;store.status(self.c,'connected')
        while True:
            await asyncio.sleep(25);await self.command('ping',{});store.status(self.c,'connected')

    async def read(self):
        async for raw in self.ws:
            frame=json.loads(raw);rid=frame.get('headers',{}).get('req_id','')
            if 'errcode' in frame and rid in self.pending:
                future=self.pending[rid]
                if not future.done():future.set_result(frame)
            elif frame.get('cmd')=='aibot_msg_callback' and self.authenticated:
                store.ingest(self.c,normalize(frame))

    async def receive(self):
        async with websockets.connect('wss://openws.work.weixin.qq.com',max_size=1048576) as ws:
            self.ws=ws
            tasks=[asyncio.create_task(self.read()),asyncio.create_task(self.keepalive())]
            try:
                done,_=await asyncio.wait(tasks,return_when=asyncio.FIRST_COMPLETED)
                for task in done:task.result()
            finally:
                self.ws=None;self.authenticated=False
                for task in tasks:task.cancel()
                await asyncio.gather(*tasks,return_exceptions=True)

    async def reply(self,event,text,reply_id):
        if not self.authenticated:raise ChannelError('delivery')
        await self.command('aibot_respond_msg',{'msgtype':'stream','stream':{'id':reply_id,'finish':True,'content':text}},event['req_id'])
