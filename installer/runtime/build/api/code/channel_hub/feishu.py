"""Feishu long connection framing, per the official larksuite/oapi-sdk-python protocol.

Uses the standard protobuf runtime; only the public wire schema is needed here.
"""
import asyncio
import json
import re
import time
from urllib.parse import urlsplit,parse_qs
import httpx
import websockets
from google.protobuf import descriptor_pb2,descriptor_pool,message_factory
from .common import official_url,ChannelError
from . import store


def frame_type():
    schema=descriptor_pb2.FileDescriptorProto(name='raccoon_feishu.proto',package='raccoon_feishu',syntax='proto2')
    header=schema.message_type.add(name='Header')
    for number,name in ((1,'key'),(2,'value')):header.field.add(name=name,number=number,type=9,label=2)
    frame=schema.message_type.add(name='Frame')
    for number,name,typ,label in ((1,'SeqID',4,2),(2,'LogID',4,2),(3,'service',5,2),(4,'method',5,2),
                                  (5,'headers',11,3),(6,'payload_encoding',9,1),(7,'payload_type',9,1),(8,'payload',12,1),(9,'LogIDNew',9,1)):
        field=frame.field.add(name=name,number=number,type=typ,label=label)
        if number==5:field.type_name='.raccoon_feishu.Header'
    pool=descriptor_pool.DescriptorPool();pool.Add(schema)
    return message_factory.GetMessageClass(pool.FindMessageTypeByName('raccoon_feishu.Frame'))


Frame=frame_type()


def normalize(data,bot_id):
    if data.get('header',{}).get('event_type')!='im.message.receive_v1':return None
    event=data.get('event',{});sender=event.get('sender',{});m=event.get('message',{})
    if sender.get('sender_type')!='user':return None
    group=m.get('chat_type')=='group';mentions=m.get('mentions',[])
    if group and not any(x.get('id',{}).get('open_id')==bot_id for x in mentions):return None
    try:content=json.loads(m.get('content') or '{}')
    except (ValueError,TypeError):content={}
    text=content.get('text','') if m.get('message_type')=='text' else ''
    for mention in mentions:
        if mention.get('id',{}).get('open_id')==bot_id and mention.get('key'):
            text=text.replace(mention['key'],'')
    return dict(id=m.get('message_id',''),user=sender.get('sender_id',{}).get('open_id',''),chat=m.get('chat_id',''),
                group=group,text=text.strip(),created=int(m.get('create_time') or time.time()*1000)/1000)


class Feishu:
    def __init__(self,c):self.c=c;self.access_token='';self.token_expires=0;self.bot_id='';self.parts={}

    async def token(self,client):
        if time.time()<self.token_expires:return self.access_token
        r=await client.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',json=self.c['credentials']);r.raise_for_status();d=r.json()
        if d.get('code')!=0 or not d.get('tenant_access_token'):raise ChannelError('credentials')
        self.access_token=d['tenant_access_token'];self.token_expires=time.time()+int(d.get('expire',7200))-60
        return self.access_token

    async def ping(self,ws,service,interval):
        while True:
            f=Frame(SeqID=0,LogID=0,service=service,method=0);f.headers.add(key='type',value='ping')
            await ws.send(f.SerializeToString());await asyncio.sleep(interval)

    async def read(self,ws):
        async for raw in ws:
            f=Frame();f.ParseFromString(raw);h={x.key:x.value for x in f.headers}
            if f.method==0:
                if h.get('type')=='pong':store.status(self.c,'connected')
                continue
            if f.method!=1 or h.get('type')!='event':continue
            count=int(h.get('sum','1'));seq=int(h.get('seq','0'));payload=f.payload
            if not 1<=count<=100 or not 0<=seq<count:raise ChannelError('offline')
            if count>1:
                now=time.monotonic();self.parts={k:v for k,v in self.parts.items() if now-v[0]<30}
                key=h.get('message_id','')
                if key not in self.parts:
                    if len(self.parts)>=100:raise ChannelError('offline')
                    self.parts[key]=(now,{})
                pieces=self.parts[key][1];pieces[seq]=payload
                if sum(len(x) for x in pieces.values())>1048576:raise ChannelError('too_long')
                if len(pieces)<count:continue
                payload=b''.join(pieces[i] for i in range(count));del self.parts[key]
            code=200
            try:
                event=json.loads(payload)
                if event.get('header',{}).get('app_id')!=self.c['credentials']['app_id']:
                    raise ChannelError('credentials')
                store.ingest(self.c,normalize(event,self.bot_id))
            except Exception:
                code=500
            f.payload=json.dumps({'code':code}).encode();await ws.send(f.SerializeToString())
            store.status(self.c,'connected')

    async def receive(self):
        creds=self.c['credentials']
        async with httpx.AsyncClient(timeout=15,trust_env=False) as client:
            token=await self.token(client)
            r=await client.get('https://open.feishu.cn/open-apis/bot/v3/info',headers={'Authorization':'Bearer '+token});r.raise_for_status()
            self.bot_id=r.json().get('bot',{}).get('open_id','')
            if not self.bot_id:raise ChannelError('credentials')
            r=await client.post('https://open.feishu.cn/callback/ws/endpoint',json={'AppID':creds['app_id'],'AppSecret':creds['app_secret']});r.raise_for_status();d=r.json()
            if d.get('code')!=0:raise ChannelError('credentials')
            data=d['data'];url=official_url(data['URL'],['feishu.cn','larksuite.com','bytedance.net'],scheme='wss')
            service=int(parse_qs(urlsplit(url).query)['service_id'][0]);interval=max(15,min(120,data.get('ClientConfig',{}).get('PingInterval',120)))
        async with websockets.connect(url,max_size=1048576) as ws:
            store.status(self.c,'connected');tasks=[asyncio.create_task(self.read(ws)),asyncio.create_task(self.ping(ws,service,interval))]
            try:
                done,_=await asyncio.wait(tasks,return_when=asyncio.FIRST_COMPLETED)
                for task in done:task.result()
            finally:
                for task in tasks:task.cancel()
                await asyncio.gather(*tasks,return_exceptions=True)

    async def reply(self,event,text,reply_id):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,200}',event['id']):raise ChannelError('delivery')
        async with httpx.AsyncClient(timeout=15,trust_env=False) as client:
            token=await self.token(client)
            r=await client.post('https://open.feishu.cn/open-apis/im/v1/messages/'+event['id']+'/reply',
                headers={'Authorization':'Bearer '+token},json={'msg_type':'text','content':json.dumps({'text':text},ensure_ascii=False),'uuid':reply_id})
            r.raise_for_status()
            if r.json().get('code')!=0:raise ChannelError('delivery')
