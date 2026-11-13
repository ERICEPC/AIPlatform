import json
import time
from urllib.parse import quote
import httpx
import websockets
from .common import official_url,ChannelError
from . import store

TOPIC='/v1.0/im/bot/messages/get'


def normalize(data):
    group=data.get('conversationType')=='2'
    if group and not data.get('isInAtList'):return None
    return dict(id=data.get('msgId',''),user=data.get('senderStaffId') or data.get('senderId',''),
                chat=data.get('conversationId',''),group=group,text=data.get('text',{}).get('content','').strip() if data.get('msgtype')=='text' else '',
                created=data.get('createAt',time.time()*1000)/1000,webhook=data.get('sessionWebhook',''),expires=data.get('sessionWebhookExpiredTime',0))


class DingTalk:
    def __init__(self,c):self.c=c

    async def receive(self):
        creds=self.c['credentials']
        async with httpx.AsyncClient(timeout=15,trust_env=False) as client:
            r=await client.post('https://api.dingtalk.com/v1.0/gateway/connections/open',json={
                'clientId':creds['client_id'],'clientSecret':creds['client_secret'],
                'subscriptions':[{'type':'CALLBACK','topic':TOPIC}], 'ua':'RaccoonSalesBuddy/1.0','localIp':'127.0.0.1'})
            if r.status_code!=200:raise ChannelError('credentials')
            data=r.json();endpoint=official_url(data['endpoint'],['dingtalk.com'],scheme='wss')
        async with websockets.connect(endpoint+'?ticket='+quote(data['ticket'],safe=''),max_size=1048576) as ws:
            store.status(self.c,'connected')
            async for raw in ws:
                frame=json.loads(raw);h=frame.get('headers',{});kind=frame.get('type');payload=json.loads(frame.get('data') or '{}')
                ack={'code':200,'message':'OK','headers':{'contentType':'application/json','messageId':h.get('messageId','')}}
                if kind=='CALLBACK' and h.get('topic')==TOPIC:
                    store.ingest(self.c,normalize(payload));ack['data']=json.dumps({'response':None})
                elif kind=='SYSTEM':
                    ack['data']=json.dumps(payload)
                else:ack['data']='{}'
                await ws.send(json.dumps(ack));store.status(self.c,'connected')
                if kind=='SYSTEM' and h.get('topic')=='disconnect':break

    async def reply(self,event,text,reply_id):
        url=official_url(event['webhook'],['oapi.dingtalk.com'],paths=['/robot/sendBySession'])
        if event.get('expires',0)<time.time()*1000:raise ChannelError('delivery')
        async with httpx.AsyncClient(timeout=15,trust_env=False) as client:
            r=await client.post(url,json={'msgtype':'text','text':{'content':text}});r.raise_for_status()
            if r.json().get('errcode')!=0:raise ChannelError('delivery')
