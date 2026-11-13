"""Registered application gateway: app identity AND app-bound end-user identity.
No existing Web/API/channel endpoints are replaced. Credentials are never persisted in plaintext.
"""
import base64
import hashlib
import hmac
import json
import logging
import re
import secrets
import time
from uuid import uuid4
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode
from flask import g,request,Response
from flask_restx import Resource
from sqlalchemy import select,text
from sqlalchemy.orm import Session
from werkzeug.exceptions import BadRequest,Conflict,Forbidden,NotFound,Unauthorized,TooManyRequests,ServiceUnavailable,HTTPException
from controllers.console import console_ns
from extensions.ext_database import db
from .personal import auth
from . import governance as gov
from .visibility import can_read
from models.account import Account
from models.agent import Agent
from models.model import App
from models.skill import Skill
from models.tools import MCPToolProvider

CAPS={'agents':'专家智能体（目录与调用）','kb':'知识库材料查询','skills':'已发布技能目录','mcp':'已授权 MCP 目录','inbox':'本人待审核事项（只读）'}
OPERATIONS={'agents.list':('agents','列出本人可访问的已发布智能体'), 'agents.invoke':('agents','调用已发布且开放 API 的智能体'), 'kb.search':('kb','按关键词查找本人获授权的材料'), 'skills.list':('skills','列出本人可访问的已发布技能'), 'mcp.list':('mcp','列出本人可访问的 MCP 服务，不返回凭据'), 'inbox.list':('inbox','查询本人待审核事项')}
log=logging.getLogger(__name__)
def digest(value):return hashlib.sha256(value.encode()).hexdigest()
def rate(s,key,limit):
    minute=int(time.time()//60)
    count=s.execute(text('INSERT INTO rx_integration_rate(key,minute,count) VALUES(:k,:m,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rx_integration_rate.minute=:m THEN rx_integration_rate.count+1 ELSE 1 END,minute=:m RETURNING count'),{'k':key,'m':minute}).scalar()
    if count>limit:raise TooManyRequests('请求过于频繁，请稍后重试')
def access_rate(key,limit):
    # Counter is committed even if authentication or execution fails.
    with Session(db.engine) as s:
        try:rate(s,key,limit)
        except TooManyRequests:s.commit();raise
        s.commit()
def app_row(s,aid,t=None,lock=False):
    sql='SELECT * FROM rx_integrations WHERE id=:id'+(' AND tenant_id=:t' if t else '')+(' FOR UPDATE' if lock else '')
    r=gov.one(s,sql,id=gov.ident(aid),t=t)
    if not r:raise NotFound('应用不存在')
    return r
def app_scope(s,t,u,r):
    p=gov.require(s,t,u,'apps.view')
    if p['role']!='super_admin' and r['department_id'] not in p['scope_ids']:gov.deny(t,u,'应用不在你的管理范围内')
    return p
def display(s,r):
    keys=gov.rows(s,'SELECT hint,expires_at,created_at FROM rx_integration_keys WHERE app_id=:id AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC',id=r['id'])
    stat=gov.one(s,"SELECT count(*) AS calls_7d,max(created_at) AS last_call, count(*) FILTER(WHERE status>=400) AS errors_7d FROM rx_integration_calls WHERE app_id=:id AND created_at>=now()-interval '7 days'",id=r['id'])
    from services.platform_applications.service import application_view
    return application_view(r,keys,stat)
def validate(s,t,b):
    caps=b.get('capabilities',[])
    if not isinstance(caps,list) or any(not isinstance(v,str) or v not in CAPS for v in caps):raise BadRequest('只能选择当前已开放的能力')
    ids=gov.ids(b.get('agent_ids',[]))
    for rid in ids:
        row=s.scalar(select(Agent).where(Agent.id==rid,Agent.tenant_id==t).execution_options(resource_acl_internal=True))
        if not row:raise BadRequest('智能体不属于当前工作空间')
    did=gov.ident(b['department_id']) if b.get('department_id') else None
    if did:gov.dept(s,t,did)
    limit=b.get('rate_limit',60)
    if isinstance(limit,bool) or not isinstance(limit,int) or not 1<=limit<=10000:raise BadRequest('限流必须为 1–10000 次/分钟')
    for key in ('sso','enabled'):
        if not isinstance(b.get(key,True if key=='sso' else False),bool):raise BadRequest('开关值无效')
    callback=b.get('callback_url','')
    if not isinstance(callback,str) or len(callback)>2000:raise BadRequest('回调地址无效')
    if callback:
        u=urlsplit(callback)
        if not u.hostname or u.username or u.password or u.fragment or (u.scheme!='https' and not(u.scheme=='http' and u.hostname in ('localhost','127.0.0.1'))):raise BadRequest('回调须为完整 HTTPS 地址；本机开发可使用 localhost HTTP')
        if any(k in ('code','state','error') for k,v in parse_qsl(u.query)):raise BadRequest('回调地址不能预含 code、state 或 error 参数')
    return dict(name=gov.label(b.get('name')),description=gov.label(b['description'],2000) if b.get('description') else '',owner_note=gov.label(b['owner_note'],200) if b.get('owner_note') else '',department_id=did,capabilities=sorted(set(caps)),agent_ids=ids,callback_url=callback,rate_limit=limit,enabled=b.get('enabled',False),sso=b.get('sso',True))

def catalog(r):
    return [{'name':name,'description':desc,'capability':cap,'risk':'execution' if name=='agents.invoke' else 'read'} for name,(cap,desc) in OPERATIONS.items() if cap in r['capabilities']]

@console_ns.route('/admin/apps')
class Applications(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        p=gov.require(s,tenant_id,current_user.id,'apps.view');clause,params=gov.scope_clause(p)
        from services.platform_applications.repository import ApplicationsRepository
        from services.platform_applications.service import application_list
        data=application_list(ApplicationsRepository(s),tenant_id,clause,params)
        return {'data':data,'capabilities':[{'id':k,'name':v} for k,v in CAPS.items()],'can_manage':p['role']=='super_admin'}
    @auth
    def post(self,s,tenant_id,current_user):
        gov.require(s,tenant_id,current_user.id,super_only=True);v=validate(s,tenant_id,gov.body());aid=str(uuid4());cid='rx_'+secrets.token_hex(12)
        v.update(id=aid,t=tenant_id,u=current_user.id,client_id=cid)
        s.execute(text('INSERT INTO rx_integrations(id,tenant_id,name,description,owner_note,department_id,client_id,capabilities,agent_ids,callback_url,sso,rate_limit,enabled,created_by) VALUES(:id,:t,:name,:description,:owner_note,:department_id,:client_id,CAST(:capabilities AS jsonb),CAST(:agent_ids AS jsonb),:callback_url,:sso,:rate_limit,:enabled,:u)'),{**v,'capabilities':json.dumps(v['capabilities']),'agent_ids':json.dumps(v['agent_ids'])})
        gov.audit(s,tenant_id,current_user.id,'application.create',aid,v['department_id']);return display(s,app_row(s,aid,tenant_id))

@console_ns.route('/admin/apps/<string:aid>')
class Application(Resource):
    @auth
    def get(self,s,tenant_id,current_user,aid):
        r=app_row(s,aid,tenant_id);app_scope(s,tenant_id,current_user.id,r)
        return {**display(s,r),'tools':catalog(r),'token_endpoint':'/console/api/x/token','gateway_endpoint':'/console/api/x/call','mcp_endpoint':'/console/api/x/mcp','authorization_page':'/#app-authorize'}
    @auth
    def patch(self,s,tenant_id,current_user,aid):
        gov.require(s,tenant_id,current_user.id,super_only=True);r=app_row(s,aid,tenant_id,True);v=validate(s,tenant_id,{**r,**gov.body()})
        changed=any(r[k]!=v[k] for k in ('department_id','capabilities','agent_ids','callback_url','sso','enabled'))
        s.execute(text('UPDATE rx_integrations SET name=:name,description=:description,owner_note=:owner_note,department_id=:department_id,capabilities=CAST(:capabilities AS jsonb),agent_ids=CAST(:agent_ids AS jsonb),callback_url=:callback_url,sso=:sso,rate_limit=:rate_limit,enabled=:enabled,config_version=config_version+:bump,updated_at=now() WHERE id=:id AND tenant_id=:t'),{**v,'id':r['id'],'t':tenant_id,'bump':int(changed),'capabilities':json.dumps(v['capabilities']),'agent_ids':json.dumps(v['agent_ids'])})
        gov.audit(s,tenant_id,current_user.id,'application.update',r['id'],v['department_id'],detail={'authorization_reset':changed,'enabled':v['enabled']})
        return display(s,app_row(s,r['id'],tenant_id))

@console_ns.route('/admin/apps/<string:aid>/rotate-secret')
class Rotate(Resource):
    @auth
    def post(self,s,tenant_id,current_user,aid):
        gov.require(s,tenant_id,current_user.id,super_only=True);r=app_row(s,aid,tenant_id,True);b=gov.body();immediate=b.get('revoke_immediately',False)
        if not isinstance(immediate,bool):raise BadRequest('轮换选项无效')
        secret='rxs_'+secrets.token_urlsafe(36);kid=str(uuid4())
        s.execute(text("UPDATE rx_integration_keys SET expires_at=CASE WHEN :immediate THEN now() ELSE LEAST(COALESCE(expires_at,now()+interval '24 hours'),now()+interval '24 hours') END WHERE app_id=:a"),{'immediate':immediate,'a':r['id']})
        s.execute(text('INSERT INTO rx_integration_keys(id,app_id,digest,hint) VALUES(:id,:a,:d,:h)'),{'id':kid,'a':r['id'],'d':digest(secret),'h':'rxs_••••'+secret[-4:]})
        gov.audit(s,tenant_id,current_user.id,'application.rotate_key',r['id'],r['department_id'],detail={'immediate':immediate})
        return Response(json.dumps({'secret':secret,'client_id':r['client_id'],'old_key_grace_hours':0 if immediate else 24}),mimetype='application/json',headers={'Cache-Control':'no-store','Pragma':'no-cache'})

def user_allowed(s,r,u):
    try:gov.member(s,r['tenant_id'],u)
    except BadRequest:raise Forbidden('该员工不在应用工作空间或已停用') from None
    if r['department_id'] and not set(gov.membership(s,r['tenant_id'],u)) & set(gov.expand(s,r['tenant_id'],[r['department_id']])):raise Forbidden('当前员工不在此应用的开放部门范围内')
def authorization_context(s,t,u,b):
    r=gov.one(s,'SELECT * FROM rx_integrations WHERE client_id=:c AND tenant_id=:t',c=b.get('client_id'),t=t)
    if not r or not r['enabled'] or not r['sso']:raise Forbidden('应用未启用统一身份授权')
    callback=b.get('redirect_uri');challenge=b.get('code_challenge');state=b.get('state')
    if not r['callback_url'] or callback!=r['callback_url']:raise BadRequest('回调地址与应用登记不一致')
    if not isinstance(challenge,str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}',challenge) or b.get('code_challenge_method')!='S256':raise BadRequest('必须使用 PKCE S256')
    if not isinstance(state,str) or not 16<=len(state)<=512:raise BadRequest('请提供至少 16 字符的随机 state')
    user_allowed(s,r,u);return r

@console_ns.route('/application-authorization')
class Authorization(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        r=authorization_context(s,tenant_id,current_user.id,request.args)
        return {'name':r['name'],'client_id':r['client_id'],'callback_url':r['callback_url'],'capabilities':[CAPS[k] for k in r['capabilities']],'account':current_user.email}
    @auth
    def post(self,s,tenant_id,current_user):
        b=gov.body();r=authorization_context(s,tenant_id,current_user.id,b)
        if b.get('approve') is not True:raise BadRequest('需要用户明确同意授权')
        code=secrets.token_urlsafe(32)
        s.execute(text("INSERT INTO rx_integration_codes(digest,app_id,account_id,redirect_uri,challenge,config_version,expires_at) VALUES(:d,:a,:u,:r,:c,:v,now()+interval '5 minutes')"),{'d':digest(code),'a':r['id'],'u':current_user.id,'r':r['callback_url'],'c':b['code_challenge'],'v':r['config_version']})
        gov.audit(s,tenant_id,current_user.id,'application.user_authorized',r['id'],r['department_id'])
        u=urlsplit(r['callback_url']);url=urlunsplit((u.scheme,u.netloc,u.path,urlencode(parse_qsl(u.query)+[('code',code),('state',b['state'])]),''))
        return Response(json.dumps({'redirect_url':url}),mimetype='application/json',headers={'Cache-Control':'no-store'})

def check_origin(r):
    origin=request.headers.get('Origin')
    if origin:
        callback=urlsplit(r['callback_url'])
        allowed=f'{callback.scheme}://{callback.netloc}' if callback.netloc else ''
        if origin!=allowed:raise Forbidden('请求来源与应用登记的回调来源不一致')

def client_credentials(s,b):
    cid=b.get('client_id');secret=b.get('client_secret')
    if not isinstance(cid,str) or len(cid)>80 or not isinstance(secret,str) or len(secret)>256:raise Unauthorized('应用凭据无效')
    r=gov.one(s,'SELECT * FROM rx_integrations WHERE client_id=:c',c=cid)
    if not r or not r['enabled']:raise Unauthorized('应用凭据无效或应用已停用')
    check_origin(r)
    access_rate('token:'+digest(cid)[:48],30)
    keys=gov.rows(s,'SELECT id,digest FROM rx_integration_keys WHERE app_id=:a AND (expires_at IS NULL OR expires_at>now())',a=r['id'])
    key=next((k for k in keys if hmac.compare_digest(k['digest'],digest(secret))),None)
    if not key:raise Unauthorized('应用凭据无效')
    return r,key

@console_ns.route('/x/token')
class Token(Resource):
    def post(self):
        b=gov.body()
        with Session(db.engine) as s:
            r,key=client_credentials(s,b);grant=b.get('grant_type','client_credentials');uid=None
            if grant=='authorization_code':
                code=b.get('code');verifier=b.get('code_verifier')
                if not isinstance(code,str) or len(code)>200 or not isinstance(verifier,str) or not re.fullmatch(r'[A-Za-z0-9._~-]{43,128}',verifier):raise BadRequest('授权码或 PKCE verifier 无效')
                c=gov.one(s,'SELECT * FROM rx_integration_codes WHERE digest=:d AND app_id=:a AND expires_at>now() AND consumed=false FOR UPDATE',d=digest(code),a=r['id'])
                challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
                if not c or not r['sso'] or c['config_version']!=r['config_version'] or b.get('redirect_uri')!=c['redirect_uri'] or not hmac.compare_digest(challenge,c['challenge']):raise Unauthorized('授权码已过期、已使用或校验失败')
                uid=c['account_id'];user_allowed(s,r,uid)
                s.execute(text('UPDATE rx_integration_codes SET consumed=true WHERE digest=:d'),{'d':c['digest']})
            elif grant!='client_credentials':raise BadRequest('不支持此授权类型')
            kind='user' if uid else 'app';token=('rxu_' if uid else 'rxa_')+secrets.token_urlsafe(36)
            s.execute(text("INSERT INTO rx_integration_tokens(digest,app_id,key_id,account_id,kind,config_version,expires_at) VALUES(:d,:a,:k,:u,:kind,:v,now()+interval '30 minutes')"),{'d':digest(token),'a':r['id'],'k':key['id'],'u':uid,'kind':kind,'v':r['config_version']});s.commit()
            return Response(json.dumps({'access_token':token,'token_type':'Bearer','expires_in':1800,'identity':kind}),mimetype='application/json',headers={'Cache-Control':'no-store','Pragma':'no-cache'})

def token_row(s,value,kind):
    if not isinstance(value,str) or len(value)>256:raise Unauthorized('令牌无效')
    r=gov.one(s,'SELECT t.* FROM rx_integration_tokens t JOIN rx_integration_keys k ON k.id=t.key_id WHERE t.digest=:d AND t.kind=:k AND t.expires_at>now() AND (k.expires_at IS NULL OR k.expires_at>now())',d=digest(value),k=kind)
    if not r:raise Unauthorized('令牌无效或已过期')
    return r

def gateway_identity(s):
    value=request.headers.get('Authorization','')
    if not value.startswith('Bearer '):raise Unauthorized('需要应用令牌')
    a=token_row(s,value[7:],'app');r=app_row(s,a['app_id'])
    if not r['enabled'] or a['config_version']!=r['config_version']:raise Unauthorized('应用已停用或授权已更新，请重新获取令牌')
    g.rx_application=r
    check_origin(r)
    u=token_row(s,request.headers.get('X-RX-User-Token',''),'user')
    if u['app_id']!=r['id'] or u['config_version']!=r['config_version']:raise Forbidden('用户令牌不属于此应用或授权已更新')
    user_allowed(s,r,u['account_id']);user=s.get(Account,u['account_id']);user.set_tenant_id_with_session(r['tenant_id'],session=s)
    g._login_user=user;g.rx_application_user=user.id;g.pop('_resource_acl_cache_key',None)
    access_rate('invoke:'+r['id'],r['rate_limit'])
    return r,user

def execute(s,r,user,operation,args):
    if operation not in OPERATIONS:raise BadRequest('此操作尚未开放')
    if OPERATIONS[operation][0] not in r['capabilities']:raise Forbidden('应用未获开放此能力')
    t=r['tenant_id'];uid=user.id
    if operation.startswith('agents.'):
        from .collaboration import agent_is_callable
        if operation=='agents.list':
            agents=s.scalars(select(Agent).where(Agent.tenant_id==t,Agent.scope=='roster',Agent.status=='active').order_by(Agent.name).limit(200))
            return {'data':[{'id':a.id,'name':a.name,'description':a.description} for a in agents if agent_is_callable(a) and (not r['agent_ids'] or a.id in r['agent_ids'])]}
        rid=gov.ident(args.get('agent_id'));a=s.scalar(select(Agent).where(Agent.id==rid,Agent.tenant_id==t,Agent.scope=='roster'))
        if not a or not can_read(s,t,uid,'agent',a) or not agent_is_callable(a) or(r['agent_ids'] and rid not in r['agent_ids']):raise NotFound('智能体未发布或当前调用者无权访问')
        target=s.get(App,a.backing_app_id or a.app_id)
        if not target or target.tenant_id!=t or not target.enable_api:raise Forbidden('该智能体未开放 API 访问')
        query=gov.label(args.get('query'),20000);g.rx_resource_id=rid
        from services.app_generate_service import AppGenerateService
        from core.app.entities.app_invoke_entities import InvokeFrom
        from raccoon_collab.stream import collect_dify
        result=AppGenerateService.generate(target,user,{'query':query,'inputs':{},'files':[]},InvokeFrom.EXPLORE,session=s,streaming=True)
        deadline=time.monotonic()+240
        def check():
            if time.monotonic()>deadline:raise ServiceUnavailable('智能体执行超时，请查看运行记录后再决定是否重试')
        answer,evidence=collect_dify(result,check)
        return {'answer':answer,'evidence':evidence,'agent_id':rid}
    if operation=='skills.list':
        data=s.scalars(select(Skill).where(Skill.tenant_id==t,Skill.latest_published_version_id.is_not(None)).order_by(Skill.name).limit(200))
        return {'data':[{'id':v.id,'name':v.display_name or v.name,'description':v.description} for v in data]}
    if operation=='mcp.list':
        data=s.scalars(select(MCPToolProvider).where(MCPToolProvider.tenant_id==t,MCPToolProvider.authed.is_(True)).limit(200))
        return {'data':[{'id':v.id,'name':v.name,'authorized':bool(v.authed)} for v in data]}
    if operation=='inbox.list':
        return {'data':gov.rows(s,"SELECT id,title,kind,status,created_at FROM human_reviews WHERE tenant_id=:t AND account_id=:u AND status='pending' ORDER BY created_at DESC LIMIT 50",t=t,u=uid)}
    if operation=='kb.search':
        from . import knowledge_bridge as kb
        state=kb.load(t,uid,user.email)
        keyword=args.get('keyword','')
        if not isinstance(keyword,str) or len(keyword)>200:raise BadRequest('关键词最长 200 字符')
        with kb.client_for(state) as client:
            response=client.post(kb.ORIGIN+'/kb/api/integrations/v1/manage/document/page/query',json={'keyword':keyword,'pageNo':1,'pageSize':20})
        if response.status_code in (301,302,303,307,308,401,403):raise Conflict('本人知识库会话已过期，请重新登录平台连接')
        if response.status_code>=400:raise ServiceUnavailable('知识库暂不可用')
        data=response.json()
        if isinstance(data,dict) and 'code' in data and str(data['code'])!='0':raise ServiceUnavailable('知识库查询失败，请检查本人连接状态')
        return data

def record_call(r,user,op,status,elapsed):
    with Session(db.engine) as s:
        s.execute(text('INSERT INTO rx_integration_calls(id,tenant_id,app_id,account_id,department_id,operation,resource_id,status,error_code,latency_ms) VALUES(:id,:t,:a,:u,:d,:op,:r,:status,:error,:ms)'),{'id':str(uuid4()),'t':r['tenant_id'],'a':r['id'],'u':user,'d':r['department_id'],'op':op[:100],'r':getattr(g,'rx_resource_id',None),'status':status,'error':'' if status<400 else 'HTTP_'+str(status),'ms':elapsed});s.commit()

def handle(mcp=False):
    started=time.monotonic();status=200;op='request';rpc_id=None
    try:
        with Session(db.engine) as s:
            r,user=gateway_identity(s);b=gov.body()
            if mcp:
                rpc_id=b.get('id');method=b.get('method');p=b.get('params') or {}
                if b.get('jsonrpc')!='2.0' or not isinstance(p,dict):raise BadRequest('无效 JSON-RPC 请求')
                if request.headers.get('MCP-Protocol-Version','2025-06-18')!='2025-06-18':raise BadRequest('不支持此 MCP 协议版本')
                if rpc_id is None and method!='notifications/initialized':raise BadRequest('此方法需要请求 id')
                op=str(method)
                if method=='initialize':result={'protocolVersion':'2025-06-18','capabilities':{'tools':{}},'serverInfo':{'name':'raccoonx-app-gateway','version':'1.0'}}
                elif method=='notifications/initialized' and rpc_id is None:return Response(status=202)
                elif method=='ping':result={}
                elif method=='tools/list':result={'tools':[{'name':x['name'].replace('.','_'),'description':x['description'],'inputSchema':{'type':'object','properties':{'agent_id':{'type':'string'},'query':{'type':'string'}} if x['name']=='agents.invoke' else {'keyword':{'type':'string'}} if x['name']=='kb.search' else {},'required':['agent_id','query'] if x['name']=='agents.invoke' else [],'additionalProperties':False}} for x in catalog(r)]}
                elif method=='tools/call':
                    name=p.get('name','');op=next((o for o in OPERATIONS if o.replace('.','_')==name),'unknown');args=p.get('arguments') or {}
                    if not isinstance(args,dict):raise BadRequest('参数必须为对象')
                    result={'content':[{'type':'text','text':json.dumps(execute(s,r,user,op,args),ensure_ascii=False,default=str)}],'isError':False}
                else:raise BadRequest('不支持此 MCP 方法')
                s.commit();return {'jsonrpc':'2.0','id':rpc_id,'result':result}
            op=b.get('operation','');args=b.get('arguments') or {}
            if not isinstance(op,str) or not isinstance(args,dict):raise BadRequest('操作或参数格式无效')
            result=execute(s,r,user,op,args);s.commit();return result
    except HTTPException as e:
        status=e.code or 500
        if mcp:return {'jsonrpc':'2.0','id':rpc_id,'error':{'code':-32000,'message':e.description}},status
        raise
    except Exception:
        status=500;log.exception('Application gateway execution failed')
        raise ServiceUnavailable('平台执行失败，请查看调用记录；不要自动重试可能产生写入的任务') from None
    finally:
        r=getattr(g,'rx_application',None)
        if r:
            try:record_call(r,getattr(g,'rx_application_user',None),str(op),status,int((time.monotonic()-started)*1000))
            except Exception:log.exception('Application gateway audit persistence failed')

@console_ns.route('/x/call')
class Gateway(Resource):
    def post(self):return handle()
@console_ns.route('/x/mcp')
class MCPGateway(Resource):
    def post(self):return handle(True)

@console_ns.route('/admin/operations')
class Operations(Resource):
    @auth
    def get(self,s,tenant_id,current_user):
        p=gov.require(s,tenant_id,current_user.id,'ops.view')
        days=request.args.get('days','7')
        if days not in ('7','30'):raise BadRequest('请选择最近 7 天或 30 天')
        from services.platform_operations.repository import OperationsRepository
        from services.platform_operations.service import get_operations
        from services.platform_operations.health import ping_cache
        scopes = {
            'current': gov.scope_clause(p, 'a.department_id'),
            'historical': gov.scope_clause(p, 'c.department_id'),
            'releases': gov.scope_clause(p),
        }
        return get_operations(OperationsRepository(s), tenant_id, p, days, scopes, ping_cache)
