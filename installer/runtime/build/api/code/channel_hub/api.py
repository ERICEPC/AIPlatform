"""Console-only channel management. All credentials stay on the server."""
import json
import time
import secrets
import logging
from uuid import uuid4
from urllib.parse import urlsplit
from flask import Blueprint, jsonify, request
from types import SimpleNamespace
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import BadRequest, Forbidden, Conflict, NotFound, HTTPException
from libs.login import login_required, current_account_with_tenant
from core.db.session_factory import session_factory
from models.account import TenantAccountJoin
from models.agent import Agent
from models.model import App, ApiToken
from extensions.ext_redis import redis_client
from configs import dify_config
from . import common

bp = Blueprint('raccoon_channels', __name__, url_prefix='/console/api/message-channels')
PREFIX = 'raccoon:channels:qr:'


def identity():
    account, tenant = current_account_with_tenant()
    with session_factory.create_session() as s:
        member = s.scalar(select(TenantAccountJoin).where(TenantAccountJoin.tenant_id == tenant, TenantAccountJoin.account_id == account.id))
        if str(account.status) != 'active' or not member or str(member.role) not in ('owner', 'admin'):
            raise Forbidden('只有当前工作空间的所有者或管理员可以管理消息渠道')
    if request.method != 'GET':
        origin = request.headers.get('Origin', '')
        expected = urlsplit(dify_config.CONSOLE_WEB_URL or request.host_url)
        actual = urlsplit(origin)
        if not origin or (actual.scheme, actual.netloc) != (expected.scheme, expected.netloc):
            raise Forbidden('请求来源不匹配，请从平台页面操作')
    return str(account.id), str(tenant)


def body():
    if request.content_length and request.content_length > 32768:
        raise BadRequest('配置过长')
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise BadRequest('请提交有效配置')
    return data


def get_row(s, tid, aid, cid, lock=False):
    row = s.execute(text('SELECT * FROM raccoon_channels WHERE tenant_id=:tid AND agent_id=:aid AND id=:id AND target_type=:target' + (' FOR UPDATE' if lock else '')), dict(tid=tid,aid=str(aid),id=cid,target='team' if '/teams/' in request.path else 'agent')).mappings().first()
    if not row:
        raise NotFound('渠道不存在')
    return dict(row)


def public(row):
    safe = {k:row[k] for k in ('id','agent_id','kind','name','enabled','revision','status','status_at','error_code','created_at','updated_at')}
    safe['settings'] = json.loads(row['settings'])
    creds = common.unseal(row['tenant_id'],row['id'],row['credentials'])
    safe['credential_fields'] = [k for k,v in creds.items() if v]
    safe['account_id'] = creds.get('app_id') or creds.get('client_id') or creds.get('bot_id') or ''
    if not row['enabled']:
        safe['status'] = 'stopped'
    elif row['status_at'] < time.time()-300:
        safe['status'] = 'offline'
    safe['status_label'] = common.ERRORS.get(safe['status'], safe['status'])
    safe['error'] = common.ERRORS.get(safe['error_code'], '')
    return safe


def agent(s, tid, aid):
    if '/teams/' in request.path:
        from team_hub.store import team
        t = team(tid, str(aid))
        return SimpleNamespace(id=t['id'], name=t['name'], active_config_snapshot_id=t['published_id'],
                               backing_app_id=None, app_id=None, is_team=True)
    value = s.scalar(select(Agent).where(Agent.id == str(aid), Agent.tenant_id == tid, Agent.status == 'active', Agent.scope == 'roster'))
    if not value:
        raise NotFound('当前工作空间中不存在这个智能体')
    return value


def require_published(a):
    if not a.active_config_snapshot_id:
        raise BadRequest('请先发布当前智能体，再配置消息渠道')


def fixed_agent(data, aid):
    if 'agent_id' in data and data['agent_id'] != str(aid):
        raise BadRequest('渠道固定绑定当前智能体，不能改绑其他智能体')


@bp.after_request
def headers(response):
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@bp.errorhandler(Exception)
def error(exc):
    if isinstance(exc, HTTPException):
        return jsonify(error=exc.description), exc.code
    if isinstance(exc, ValueError):
        return jsonify(error=str(exc)), 400
    if isinstance(exc, IntegrityError):
        return jsonify(error='这个机器人已经绑定过，请编辑已有渠道'), 409
    # Exceptions may contain vendor URLs/tokens or SQL parameters; do not log their repr.
    logging.getLogger('channel_hub.api').error('channel request failed: %s',type(exc).__name__)
    return jsonify(error='操作失败，请稍后重试或联系平台管理员'), 500


@bp.get('')
@login_required
def legacy_entry():
    identity()
    raise BadRequest('请从智能体的访问点进入消息渠道')


@bp.get('/agents/<uuid:agent_id>')
@bp.get('/teams/<uuid:agent_id>')
@login_required
def listing(agent_id):
    _, tid = identity()
    with session_factory.create_session() as s:
        a = agent(s,tid,agent_id)
        app = None if getattr(a,'is_team',False) else s.get(App,a.backing_app_id or a.app_id)
        data = s.execute(text('SELECT * FROM raccoon_channels WHERE tenant_id=:tid AND agent_id=:aid ORDER BY created_at'), dict(tid=tid,aid=str(agent_id))).mappings()
        channels = [public(dict(r)) for r in data]
        current = dict(id=a.id,name=a.name,published=bool(a.active_config_snapshot_id),api_enabled=bool(getattr(a,'is_team',False) or (app and app.enable_api)))
    return jsonify(channels=channels,agent=current,workspace_id=tid)


@bp.post('/agents/<uuid:agent_id>')
@bp.post('/teams/<uuid:agent_id>')
@login_required
def create(agent_id):
    uid,tid=identity(); data=body(); kind=data.get('kind'); cid=str(uuid4()); now=time.time()
    fixed_agent(data,agent_id)
    if kind not in common.KINDS:
        raise BadRequest('未知渠道类型')
    with session_factory.create_session() as s:
        a=agent(s,tid,agent_id)
        require_published(a)
        n=s.execute(text('SELECT count(*) FROM raccoon_channels WHERE tenant_id=:tid'),dict(tid=tid)).scalar()
        if n>=30:
            raise BadRequest('当前工作空间最多创建 30 个渠道')
        s.execute(text('''INSERT INTO raccoon_channels(id,tenant_id,agent_id,kind,name,credentials,settings,created_by,created_at,updated_at,target_type)
         VALUES(:id,:tid,:aid,:kind,:name,:creds,:settings,:uid,:now,:now,:target)'''),
         dict(id=cid,tid=tid,aid=a.id,target='team' if getattr(a,'is_team',False) else 'agent',kind=kind,name=common.KINDS[kind],creds=common.seal(tid,cid,{}),
              settings=json.dumps(common.settings({})),uid=uid,now=now))
        s.commit(); result=public(get_row(s,tid,agent_id,cid))
    return jsonify(channel=result),201


@bp.post('/agents/<uuid:agent_id>/<uuid:channel_id>')
@bp.post('/teams/<uuid:agent_id>/<uuid:channel_id>')
@login_required
def configure(agent_id,channel_id):
    _,tid=identity(); cid=str(channel_id); data=body()
    fixed_agent(data,agent_id)
    with session_factory.create_session() as s:
        a=agent(s,tid,agent_id)
        row=get_row(s,tid,agent_id,cid,True)
        if data.get('revision') != row['revision']:
            raise Conflict('配置已更新，请刷新后重试')
        if row['enabled']:
            raise Conflict('请先暂停渠道，再修改配置')
        name=data.get('name',row['name'])
        if not isinstance(name,str) or not name.strip() or len(name)>80:
            raise BadRequest('名称不能为空且不能超过 80 字')
        old=common.unseal(tid,cid,row['credentials'])
        # WeChat credentials can only be established by the server-side QR flow.
        incoming=data.get('credentials',{})
        if row['kind']=='wechat' and incoming:
            raise BadRequest('微信凭据请通过扫码绑定')
        creds=common.credentials(row['kind'],incoming,old)
        policy=common.settings(data.get('settings',json.loads(row['settings'])))
        identifier=creds.get('app_id') or creds.get('client_id') or creds.get('bot_id')
        account_hash=common.fingerprint(row['kind'],identifier) if identifier else None
        token_id=row['token_id']
        if account_hash!=row['account_hash']:
            s.execute(text('DELETE FROM raccoon_channel_sessions WHERE channel_id=:id'),dict(id=cid))
            s.execute(text('DELETE FROM raccoon_channel_cursors WHERE channel_id=:id'),dict(id=cid))
        s.execute(text('''UPDATE raccoon_channels SET name=:name,credentials=:creds,settings=:settings,
         account_hash=:hash,token_id=:token,revision=revision+1,updated_at=:now,error_code='' WHERE id=:id'''),
         dict(id=cid,name=name.strip(),creds=common.seal(tid,cid,creds),settings=json.dumps(policy),hash=account_hash,token=token_id,now=time.time()))
        s.execute(text("UPDATE raccoon_channel_jobs SET state='cancelled',payload='' WHERE channel_id=:id AND state='pending'"),dict(id=cid))
        s.commit(); result=public(get_row(s,tid,agent_id,cid))
    return jsonify(channel=result)


def revoke(s,token_id):
    from services.api_token_service import ApiTokenCache
    token=s.get(ApiToken,token_id)
    if token:
        ApiTokenCache.delete(token.token,token.type)
        s.delete(token)


@bp.post('/agents/<uuid:agent_id>/<uuid:channel_id>/enabled')
@bp.post('/teams/<uuid:agent_id>/<uuid:channel_id>/enabled')
@login_required
def enabled(agent_id,channel_id):
    _,tid=identity(); cid=str(channel_id); data=body()
    fixed_agent(data,agent_id)
    if type(data.get('enabled')) is not bool:
        raise BadRequest('无效的启停状态')
    with session_factory.create_session() as s:
        a=agent(s,tid,agent_id)
        row=get_row(s,tid,agent_id,cid,True)
        if data.get('revision')!=row['revision']:
            raise Conflict('配置已更新，请刷新后重试')
        token_id=row['token_id']
        if data['enabled']:
            common.ready(row['kind'],common.unseal(tid,cid,row['credentials']),json.loads(row['settings']))
            if getattr(a,'is_team',False):
                require_published(a)
            else:
                app=s.get(App,a.backing_app_id or a.app_id)
                if not a.active_config_snapshot_id or not app or not app.enable_api:
                    raise BadRequest('请先发布该 Agent，并在访问点开启后端服务 API')
                if not token_id or not s.get(ApiToken,token_id):
                    t=ApiToken();t.app_id=app.id;t.tenant_id=tid;t.type='app';t.token=ApiToken.generate_api_key('app-',32,session=s)
                    s.add(t);s.flush();token_id=t.id
        s.execute(text('''UPDATE raccoon_channels SET enabled=:enabled,token_id=:token,revision=revision+1,
         status=:status,status_at=:now,error_code='',updated_at=:now WHERE id=:id'''),
         dict(id=cid,enabled=data['enabled'],token=token_id,status='connecting' if data['enabled'] else 'stopped',now=time.time()))
        s.execute(text("UPDATE raccoon_channel_jobs SET state='cancelled',payload='' WHERE channel_id=:id AND state='pending'"),dict(id=cid))
        s.commit(); result=public(get_row(s,tid,agent_id,cid))
    return jsonify(channel=result)


@bp.delete('/agents/<uuid:agent_id>/<uuid:channel_id>')
@bp.delete('/teams/<uuid:agent_id>/<uuid:channel_id>')
@login_required
def delete(agent_id,channel_id):
    _,tid=identity();cid=str(channel_id);data=body()
    with session_factory.create_session() as s:
        agent(s,tid,agent_id)
        row=get_row(s,tid,agent_id,cid,True)
        if row['enabled'] or data.get('revision')!=row['revision']:
            raise Conflict('请先暂停渠道并刷新配置')
        if row['token_id']:
            revoke(s,row['token_id'])
        s.execute(text('DELETE FROM raccoon_channels WHERE id=:id'),dict(id=cid));s.commit()
    return jsonify(ok=True)


@bp.get('/agents/<uuid:agent_id>/<uuid:channel_id>/events')
@bp.get('/teams/<uuid:agent_id>/<uuid:channel_id>/events')
@login_required
def events(agent_id,channel_id):
    _,tid=identity();cid=str(channel_id)
    with session_factory.create_session() as s:
        agent(s,tid,agent_id)
        get_row(s,tid,agent_id,cid)
        jobs=s.execute(text('''SELECT id,state,error_code,duration,created_at,payload FROM raccoon_channel_jobs
         WHERE channel_id=:id AND tenant_id=:tid ORDER BY created_at DESC LIMIT 30'''),dict(id=cid,tid=tid)).mappings()
        items=[]
        for j in jobs:
            item=dict(j);payload=item.pop('payload')
            routing=common.unseal(tid,cid,payload) if payload else {}
            item.update(description=common.ERRORS.get(j['error_code'],''),sender_id=routing.get('user',''),chat_id=routing.get('chat',''))
            items.append(item)
    return jsonify(events=items)


@bp.post('/agents/<uuid:agent_id>/<uuid:channel_id>/qr')
@bp.post('/teams/<uuid:agent_id>/<uuid:channel_id>/qr')
@login_required
def qr_start(agent_id,channel_id):
    from .wechat import create_qr
    uid,tid=identity();cid=str(channel_id)
    with session_factory.create_session() as s:
        require_published(agent(s,tid,agent_id))
        row=get_row(s,tid,agent_id,cid)
    if row['kind']!='wechat' or row['enabled']:
        raise BadRequest('请先暂停微信渠道')
    lock=PREFIX+'rate:'+cid
    if not redis_client.set(lock,'1',ex=15,nx=True):
        raise BadRequest('请等待 15 秒后再刷新二维码')
    qr=create_qr(); ticket=secrets.token_urlsafe(32)
    state=dict(uid=uid,tid=tid,aid=str(agent_id),cid=cid,revision=row['revision'],qrcode=qr['qrcode'],base_url='https://ilinkai.weixin.qq.com')
    redis_client.set(PREFIX+ticket,common.seal(tid,cid,state),ex=300)
    import qrcode
    import qrcode.image.svg
    import io
    content=qr.get('qrcode_img_content') or qr['qrcode']
    image=qrcode.make(content,image_factory=qrcode.image.svg.SvgPathImage); buf=io.BytesIO();image.save(buf)
    return jsonify(ticket=ticket,svg=buf.getvalue().decode(),expires_in=300)


@bp.post('/agents/<uuid:agent_id>/<uuid:channel_id>/qr/poll')
@bp.post('/teams/<uuid:agent_id>/<uuid:channel_id>/qr/poll')
@login_required
def qr_poll(agent_id,channel_id):
    from .wechat import poll_qr
    uid,tid=identity();cid=str(channel_id);data=body();ticket=data.get('ticket','')
    with session_factory.create_session() as s:
        require_published(agent(s,tid,agent_id))
        row=get_row(s,tid,agent_id,cid)
    if row['kind']!='wechat' or row['enabled']:
        raise BadRequest('请先暂停微信渠道')
    if not isinstance(ticket,str) or len(ticket)>100:
        raise BadRequest('无效的扫码请求')
    value=redis_client.get(PREFIX+ticket)
    if not value:
        return jsonify(status='expired')
    state=common.unseal(tid,cid,value.decode() if isinstance(value,bytes) else value)
    if state['uid']!=uid:
        raise Forbidden('请使用发起扫码的本人账号')
    if state.get('aid')!=str(agent_id) or state.get('cid')!=cid or state.get('tid')!=tid:
        raise Forbidden('扫码请求不属于当前智能体渠道，请重新扫码')
    if row['revision']!=state['revision']:
        raise Conflict('扫码期间配置已改变，请重新扫码')
    verify=data.get('verify_code','')
    if not isinstance(verify,str) or len(verify)>16:
        raise BadRequest('验证码无效')
    result=poll_qr(state['base_url'],state['qrcode'],verify)
    if result.get('status')=='scaned_but_redirect':
        host=result.get('redirect_host',''); base=host if host.startswith('https://') else 'https://'+host
        common.official_url(base,['weixin.qq.com']); state['base_url']=base
        ttl=redis_client.ttl(PREFIX+ticket)
        if ttl>0: redis_client.set(PREFIX+ticket,common.seal(tid,cid,state),ex=ttl)
        return jsonify(status='scaned')
    if result.get('status')=='confirmed':
        creds=dict(bot_id=result.get('ilink_bot_id',''),bot_token=result.get('bot_token',''),owner_id=result.get('ilink_user_id',''),
                   base_url=result.get('baseurl') or state['base_url'])
        common.official_url(creds['base_url'],['weixin.qq.com'])
        if not all(creds.values()): raise BadRequest('微信授权未返回完整身份，请重新扫码')
        with session_factory.create_session() as s:
            require_published(agent(s,tid,agent_id))
            row=get_row(s,tid,agent_id,cid,True)
            if row['enabled'] or row['revision']!=state['revision']:
                raise Conflict('扫码期间配置已改变，请重新扫码')
            s.execute(text('DELETE FROM raccoon_channel_sessions WHERE channel_id=:id'),dict(id=cid))
            s.execute(text('DELETE FROM raccoon_channel_cursors WHERE channel_id=:id'),dict(id=cid))
            policy=common.settings(json.loads(row['settings']));policy['access']='restricted';policy['allowed_users']=[creds['owner_id']];policy['groups']=False
            s.execute(text('''UPDATE raccoon_channels SET credentials=:creds,account_hash=:hash,settings=:policy,
              revision=revision+1,updated_at=:now WHERE id=:id'''),dict(id=cid,creds=common.seal(tid,cid,creds),
               hash=common.fingerprint('wechat',creds['bot_id']),policy=json.dumps(policy),now=time.time()))
            s.commit()
        redis_client.delete(PREFIX+ticket)
    return jsonify(status=result.get('status','wait'))
