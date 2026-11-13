import asyncio
import base64
import secrets
import time
import httpx
from .common import ChannelError, official_url
from . import store

BASE='https://ilinkai.weixin.qq.com'
VERSION='2.4.8'


def headers(token=None,poll=False):
    result={'iLink-App-Id':'bot','iLink-App-ClientVersion':str((2<<16)|(4<<8)|8)}
    if not poll:
        result.update({'Content-Type':'application/json','AuthorizationType':'ilink_bot_token',
                       'X-WECHAT-UIN':base64.b64encode(str(secrets.randbits(32)).encode()).decode()})
    if token:result['Authorization']='Bearer '+token
    return result


def create_qr():
    with httpx.Client(timeout=15,trust_env=False) as client:
        r=client.post(BASE+'/ilink/bot/get_bot_qrcode?bot_type=3',headers=headers(),json={'local_token_list':[]})
        r.raise_for_status();data=r.json()
        if not data.get('qrcode'):raise ChannelError('credentials')
        return data


def poll_qr(base,qr,verify=''):
    official_url(base,['weixin.qq.com']);params={'qrcode':qr}
    if verify:params['verify_code']=verify
    with httpx.Client(timeout=6,trust_env=False) as client:
        try:r=client.get(base.rstrip('/')+'/ilink/bot/get_qrcode_status',params=params,headers=headers(poll=True))
        except httpx.ReadTimeout:return {'status':'wait'}
        r.raise_for_status();return r.json()


def normalize(message):
    if message.get('message_type')!=1:return None
    text='\n'.join(x.get('text_item',{}).get('text','') for x in message.get('item_list',[]) if x.get('type')==1)
    return dict(id=str(message.get('message_id','')),user=message.get('from_user_id',''),chat=message.get('from_user_id',''),
                group=False,text=text,created=message.get('create_time_ms',time.time()*1000)/1000,
                context_token=message.get('context_token',''))


class WeChat:
    def __init__(self,c):self.c=c

    async def post(self,client,path,payload):
        creds=self.c['credentials'];base=official_url(creds['base_url'],['weixin.qq.com']).rstrip('/')
        payload=dict(payload,base_info={'channel_version':VERSION,'bot_agent':'RaccoonSalesBuddy/1.0'})
        r=await client.post(base+path,headers=headers(creds['bot_token']),json=payload);r.raise_for_status();data=r.json()
        if data.get('ret',0)!=0 or data.get('errcode',0)!=0:raise ChannelError('credentials' if -14 in (data.get('ret'),data.get('errcode')) else 'offline')
        return data

    async def receive(self):
        found=store.rows('SELECT cursor FROM raccoon_channel_cursors WHERE channel_id=:id',id=self.c['id'])
        cursor=found[0]['cursor'] if found else ''
        async with httpx.AsyncClient(timeout=45,trust_env=False) as client:
            while True:
                data=await self.post(client,'/ilink/bot/getupdates',{'get_updates_buf':cursor})
                for item in data.get('msgs',[]):store.ingest(self.c,normalize(item))
                # Advance only after every message was persisted.
                next_cursor=data.get('get_updates_buf')
                if next_cursor:
                    cursor=next_cursor
                    store.run('''INSERT INTO raccoon_channel_cursors(channel_id,cursor) VALUES(:id,:cur)
                     ON CONFLICT(channel_id) DO UPDATE SET cursor=EXCLUDED.cursor''',id=self.c['id'],cur=cursor)
                store.status(self.c,'connected');await asyncio.sleep(.05)

    async def reply(self,event,text,reply_id):
        if not event.get('context_token'):raise ChannelError('delivery')
        async with httpx.AsyncClient(timeout=15,trust_env=False) as client:
            data=await self.post(client,'/ilink/bot/sendmessage',{'msg':dict(from_user_id='',to_user_id=event['user'],client_id=reply_id,
                message_type=2,message_state=2,context_token=event['context_token'],item_list=[{'type':1,'text_item':{'text':text}}])})
            if data.get('ret')!=0:raise ChannelError('delivery')
