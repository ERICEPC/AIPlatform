"""Account-bound outbound desktop connector. No remote shell or implicit local grants."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import uuid
from flask import request
from flask_restx import Resource
from sqlalchemy import text
from sqlalchemy.orm import Session
from werkzeug.exceptions import BadRequest, Forbidden, NotFound, Conflict, ServiceUnavailable
from controllers.console import console_ns
from extensions.ext_database import db
from .personal import auth, service_token

TOOLS = frozenset(('workspace.list', 'workspace.read', 'workspace.write', 'browser.open', 'browser.read', 'browser.click', 'browser.type', 'app.open', 'app.inspect', 'app.press', 'app.setValue'))

_SCHEMA_READY = False

def schema(s):
    global _SCHEMA_READY
    if _SCHEMA_READY: return
    for sql in [
        '''CREATE TABLE IF NOT EXISTS rx_desktop_pairings (id text PRIMARY KEY, secret_hash text NOT NULL, device_name text NOT NULL, expires double precision NOT NULL, tenant_id uuid, account_id uuid, device_id text)''',
        '''CREATE TABLE IF NOT EXISTS rx_desktop_devices (id text PRIMARY KEY, tenant_id uuid NOT NULL, account_id uuid NOT NULL, name text NOT NULL, token_hash text NOT NULL UNIQUE, revoked boolean NOT NULL DEFAULT false, seen double precision NOT NULL DEFAULT 0, workspaces jsonb NOT NULL DEFAULT '[]')''',
        '''CREATE TABLE IF NOT EXISTS rx_desktop_tasks (id text PRIMARY KEY, device_id text NOT NULL REFERENCES rx_desktop_devices(id), workspace_id text NOT NULL, summary text NOT NULL, expires double precision NOT NULL, stopped boolean NOT NULL DEFAULT false)''',
        '''CREATE TABLE IF NOT EXISTS rx_desktop_calls (id text PRIMARY KEY, task_id text NOT NULL REFERENCES rx_desktop_tasks(id), tool text NOT NULL, args jsonb NOT NULL, status text NOT NULL DEFAULT 'queued', result jsonb, created double precision NOT NULL)''',
        'CREATE INDEX IF NOT EXISTS rx_desktop_calls_queue ON rx_desktop_calls(status,created)',
    ]: s.execute(text(sql))
    s.commit()
    _SCHEMA_READY = True

def digest(v): return hashlib.sha256(v.encode()).hexdigest()
def body():
    if request.content_length and request.content_length > 1_500_000: raise BadRequest('请求过大')
    p = request.get_json(silent=True)
    if not isinstance(p, dict): raise BadRequest('请求必须是对象')
    return p

def device(s):
    token = request.headers.get('Authorization', '').removeprefix('Bearer ')
    row = s.execute(text('SELECT * FROM rx_desktop_devices WHERE token_hash=:h AND revoked=false'), {'h':digest(token)}).mappings().first()
    if not row: raise Forbidden('设备凭据无效或已撤销')
    return row

def owned(s, t, a, d):
    row = s.execute(text('SELECT * FROM rx_desktop_devices WHERE id=:d AND tenant_id=:t AND account_id=:a AND revoked=false'),dict(d=d,t=t,a=a)).mappings().first()
    if not row: raise NotFound('找不到当前账号的设备')
    return row

def sign_task(task, device_id):
    data = base64.urlsafe_b64encode(json.dumps({'task':task,'device':device_id,'exp':time.time()+310}).encode()).decode()
    return data+'.'+hmac.new(service_token().encode(),data.encode(),hashlib.sha256).hexdigest()

def scope():
    try:
        data, signature = request.headers.get('Authorization','').removeprefix('Bearer ').split('.')
        if not hmac.compare_digest(signature,hmac.new(service_token().encode(),data.encode(),hashlib.sha256).hexdigest()): raise ValueError()
        p=json.loads(base64.urlsafe_b64decode(data))
        if p['exp'] < time.time(): raise ValueError()
        return p
    except (ValueError,KeyError,TypeError): raise Forbidden('任务授权已失效') from None

def start_task(s,t,a,d,w,summary):
    schema(s)
    row=owned(s,t,a,d)
    if row['seen'] < time.time()-30: raise ServiceUnavailable('本地连接器离线，请先启动客户端')
    if not any(x['id']==w for x in row['workspaces']): raise BadRequest('工作区未在本机授权')
    task=secrets.token_urlsafe(24)
    s.execute(text('INSERT INTO rx_desktop_tasks(id,device_id,workspace_id,summary,expires) VALUES(:id,:d,:w,:s,:e)'),dict(id=task,d=d,w=w,s=summary[:1000],e=time.time()+300));s.commit()
    return {'url':os.environ.get('DESKTOP_BRIDGE_URL','http://api:5001/console/api/desktop/bridge'), 'token':sign_task(task,d), 'task':task, 'workspace':w}

def end_task(task):
    with Session(db.engine) as s:
        s.execute(text('UPDATE rx_desktop_tasks SET stopped=true WHERE id=:id'),{'id':task});s.commit()

@console_ns.route('/desktop/pair')
class Pair(Resource):
    def post(self):
        p=body(); name=p.get('name','')
        if not isinstance(name,str) or not 1<=len(name)<=100: raise BadRequest('设备名称无效')
        with Session(db.engine) as s:
            schema(s)
            # Global admission cap and expiring records; no account identity disclosed before confirmation.
            s.execute(text('DELETE FROM rx_desktop_pairings WHERE expires<:n'),{'n':time.time()})
            if s.execute(text('SELECT count(*) FROM rx_desktop_pairings')).scalar()>=100: raise Conflict('配对请求过多，请稍后重试')
            pair=secrets.token_urlsafe(24); secret=secrets.token_urlsafe(32)
            s.execute(text('INSERT INTO rx_desktop_pairings(id,secret_hash,device_name,expires) VALUES(:i,:h,:n,:e)'),dict(i=pair,h=digest(secret),n=name,e=time.time()+300));s.commit()
            return {'id':pair,'secret':secret,'expiresIn':300}

@console_ns.route('/desktop/pair/<string:pair_id>')
class PairPoll(Resource):
    def post(self,pair_id):
        p=body()
        with Session(db.engine) as s:
            schema(s)
            row=s.execute(text('SELECT * FROM rx_desktop_pairings WHERE id=:i AND expires>:n FOR UPDATE'),{'i':pair_id,'n':time.time()}).mappings().first()
            if not row or not hmac.compare_digest(row['secret_hash'],digest(str(p.get('secret','')))): raise Forbidden('配对已失效')
            if not row['device_id']: return {'status':'pending'}
            # Deterministic credential derived from the client-held secret: retrying delivery is safe.
            token=hmac.new(str(p['secret']).encode(),row['device_id'].encode(),hashlib.sha256).hexdigest()
            s.execute(text('UPDATE rx_desktop_devices SET token_hash=:h WHERE id=:d'),{'h':digest(token),'d':row['device_id']});s.commit()
            return {'status':'approved','deviceId':row['device_id'],'token':token}

@console_ns.route('/desktop/authorize/<string:pair_id>')
class Authorize(Resource):
    @auth
    def get(self,session,tenant_id,current_user,pair_id):
        schema(session)
        row=session.execute(text('SELECT device_name FROM rx_desktop_pairings WHERE id=:i AND expires>:n'),{'i':pair_id,'n':time.time()}).mappings().first()
        if not row: raise NotFound('配对已过期，请从客户端重新登录')
        return dict(row)
    @auth
    def post(self,session,tenant_id,current_user,pair_id):
        schema(session)
        row=session.execute(text('SELECT * FROM rx_desktop_pairings WHERE id=:i AND expires>:n FOR UPDATE'),{'i':pair_id,'n':time.time()}).mappings().first()
        if not row: raise NotFound('配对已过期')
        if row['device_id']: raise Conflict('此请求已处理')
        d=str(uuid.uuid4())
        session.execute(text('INSERT INTO rx_desktop_devices(id,tenant_id,account_id,name,token_hash) VALUES(:d,:t,:a,:n,:h)'),dict(d=d,t=tenant_id,a=current_user.id,n=row['device_name'],h=digest(secrets.token_urlsafe(32))))
        session.execute(text('UPDATE rx_desktop_pairings SET device_id=:d,tenant_id=:t,account_id=:a WHERE id=:i'),dict(d=d,t=tenant_id,a=current_user.id,i=pair_id))
        session.commit();return {'ok':True}

@console_ns.route('/desktop/devices')
class Devices(Resource):
    @auth
    def get(self,session,tenant_id,current_user):
        schema(session)
        rows=session.execute(text('SELECT id,name,seen,workspaces FROM rx_desktop_devices WHERE tenant_id=:t AND account_id=:a AND revoked=false'),dict(t=tenant_id,a=current_user.id)).mappings()
        return {'devices':[{**dict(r),'online':r['seen']>time.time()-30} for r in rows]}

@console_ns.route('/desktop/devices/<string:device_id>')
class Revoke(Resource):
    @auth
    def delete(self,session,tenant_id,current_user,device_id):
        schema(session);owned(session,tenant_id,current_user.id,device_id)
        session.execute(text('UPDATE rx_desktop_devices SET revoked=true WHERE id=:d'),{'d':device_id});session.execute(text('UPDATE rx_desktop_tasks SET stopped=true WHERE device_id=:d'),{'d':device_id});session.commit();return {'ok':True}

@console_ns.route('/desktop/poll')
class Poll(Resource):
    def post(self):
        p=body()
        with Session(db.engine) as s:
            schema(s);d=device(s)
            ws=p.get('workspaces',[])
            if not isinstance(ws,list) or len(ws)>20 or any(not isinstance(w,dict) or set(w)!={'id','name','writable'} or not isinstance(w['id'],str) or len(w['id'])>100 or not isinstance(w['name'],str) or len(w['name'])>200 or not isinstance(w['writable'],bool) for w in ws): raise BadRequest('工作区信息无效')
            s.execute(text('UPDATE rx_desktop_devices SET seen=:n,workspaces=CAST(:w AS jsonb) WHERE id=:d'),{'n':time.time(),'w':json.dumps(ws),'d':d['id']})
            tasks=s.execute(text('SELECT id FROM rx_desktop_tasks WHERE device_id=:d AND stopped=false AND expires>:n'),{'d':d['id'],'n':time.time()}).scalars().all()
            row=s.execute(text('''SELECT c.id,c.tool,c.args,t.id AS task,t.summary,t.workspace_id,t.expires FROM rx_desktop_calls c JOIN rx_desktop_tasks t ON c.task_id=t.id WHERE t.device_id=:d AND t.stopped=false AND t.expires>:n AND c.status='queued' ORDER BY c.created FOR UPDATE OF c SKIP LOCKED LIMIT 1'''),{'d':d['id'],'n':time.time()}).mappings().first()
            if row:s.execute(text("UPDATE rx_desktop_calls SET status='claimed' WHERE id=:i"),{'i':row['id']})
            s.commit();return {'call':dict(row) if row else None,'activeTasks':tasks}

@console_ns.route('/desktop/result/<string:call_id>')
class Result(Resource):
    def post(self,call_id):
        p=body()
        with Session(db.engine) as s:
            d=device(s)
            row=s.execute(text('SELECT c.status FROM rx_desktop_calls c JOIN rx_desktop_tasks t ON c.task_id=t.id WHERE c.id=:i AND t.device_id=:d FOR UPDATE OF c'),{'i':call_id,'d':d['id']}).mappings().first()
            if not row:raise NotFound('找不到设备任务')
            if row['status']=='claimed':s.execute(text("UPDATE rx_desktop_calls SET result=CAST(:r AS jsonb),status='done' WHERE id=:i"),{'r':json.dumps(p),'i':call_id})
            s.commit();return {'ok':True}

@console_ns.route('/desktop/stop/<string:task_id>')
class Stop(Resource):
    def post(self,task_id):
        with Session(db.engine) as s:
            d=device(s);s.execute(text('UPDATE rx_desktop_tasks SET stopped=true WHERE id=:i AND device_id=:d'),{'i':task_id,'d':d['id']});s.commit();return {'ok':True}

@console_ns.route('/desktop/bridge')
class Bridge(Resource):
    def post(self):
        claim=scope();p=body(); tool=p.get('tool');args=p.get('arguments',{})
        if tool not in TOOLS or not isinstance(args,dict):raise BadRequest('本地工具无效')
        with Session(db.engine) as s:
            task=s.execute(text('SELECT t.* FROM rx_desktop_tasks t JOIN rx_desktop_devices d ON t.device_id=d.id WHERE t.id=:i AND t.device_id=:d AND d.revoked=false AND t.stopped=false AND t.expires>:n'),{'i':claim['task'],'d':claim['device'],'n':time.time()}).mappings().first()
            if not task:raise Forbidden('任务已结束或设备已撤销')
            count=s.execute(text('SELECT count(*) FROM rx_desktop_calls WHERE task_id=:t'),{'t':task['id']}).scalar()
            if count>=100:raise Conflict('任务操作次数已达上限')
            i=secrets.token_urlsafe(24)
            s.execute(text('INSERT INTO rx_desktop_calls(id,task_id,tool,args,created) VALUES(:i,:t,:tool,CAST(:a AS jsonb),:n)'),{'i':i,'t':task['id'],'tool':tool,'a':json.dumps(args),'n':time.time()});s.commit()
        # Separate short transactions; never hold locks or a stale ORM snapshot while waiting.
        deadline=min(task['expires'],time.time()+95)
        while time.time()<deadline:
            with Session(db.engine) as s:
                row=s.execute(text('SELECT c.result,c.status,t.stopped FROM rx_desktop_calls c JOIN rx_desktop_tasks t ON c.task_id=t.id WHERE c.id=:i'),{'i':i}).mappings().first()
                if row['stopped']:raise Conflict('任务已在本机停止')
                if row['status']=='done':return row['result']
            time.sleep(.5)
        # Cancel whole task, not just the call. Claimed actions might have run; never requeue.
        end_task(task['id'])
        raise Conflict('本机操作超时，任务已停止；结果不确定，请检查本机，禁止自动重试')

@console_ns.route('/desktop/check/<string:task_id>')
class Check(Resource):
    def post(self,task_id):
        with Session(db.engine) as s:
            d=device(s)
            task=s.execute(text('SELECT id FROM rx_desktop_tasks WHERE id=:i AND device_id=:d AND stopped=false AND expires>:n'),{'i':task_id,'d':d['id'],'n':time.time()}).scalar()
            if not task: raise Conflict('任务已停止或过期，未执行本机动作')
            return {'active':True}
