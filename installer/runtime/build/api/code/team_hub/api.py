import json
import logging
import secrets
import time
import yaml
from functools import wraps
from uuid import uuid4
from urllib.parse import urlsplit
from flask import Blueprint, jsonify, request
from sqlalchemy import select, text
from werkzeug.exceptions import BadRequest, Conflict, Forbidden, HTTPException, NotFound, Unauthorized
from libs.login import login_required, current_account_with_tenant
from core.db.session_factory import session_factory
from models.account import TenantAccountJoin
from configs import dify_config
from . import contracts, logs, monitoring, store
from .avatar import validate_avatar_file, team_view

bp = Blueprint('raccoon_teams', __name__, url_prefix='/console/api/agent-teams')
public_bp = Blueprint('raccoon_team_api', __name__, url_prefix='/v1/agent-teams')


def identity():
    account, tenant = current_account_with_tenant()
    with session_factory.create_session() as s:
        member = s.scalar(select(TenantAccountJoin).where(TenantAccountJoin.tenant_id == tenant, TenantAccountJoin.account_id == account.id))
        if str(account.status) != 'active' or not member or str(member.role) not in ('owner', 'admin', 'editor'):
            raise Forbidden('只有当前工作空间的所有者、管理员或编辑者可以使用 Agent Teams')
    if request.method != 'GET':
        actual = urlsplit(request.headers.get('Origin', ''))
        expected = urlsplit(dify_config.CONSOLE_WEB_URL or request.host_url)
        if not actual.netloc or (actual.scheme, actual.netloc) != (expected.scheme, expected.netloc):
            raise Forbidden('请从平台页面操作')
    return str(account.id), str(tenant)


def body():
    if request.content_length and request.content_length > 100000:
        raise BadRequest('输入过长')
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise BadRequest('请提交有效的 JSON')
    return data


def agents(tid):
    return store.rows('''SELECT CAST(a.id AS text) id,a.name,a.description,CAST(a.active_config_snapshot_id AS text) snapshot_id,
        s.version FROM agents a JOIN agent_config_snapshots s ON s.id=a.active_config_snapshot_id AND s.agent_id=a.id AND s.tenant_id=a.tenant_id
        WHERE CAST(a.tenant_id AS text)=:tid AND a.status='active' AND a.scope='roster' ORDER BY a.name''', tid=tid)


def freeze(tid, value):
    available = {a['id']: a for a in agents(tid)}
    ids = [value['leader_id']] + [m['agent_id'] for m in value['members']]
    if any(aid not in available for aid in ids):
        raise BadRequest('团长和专家都必须是当前工作空间内已发布的 Agent，请刷新选择')
    frozen = dict(value)
    frozen['agents'] = {aid: available[aid] for aid in ids}
    return frozen


def revision(data, t):
    if type(data.get('revision')) is not int or data['revision'] != t['revision']:
        raise Conflict('团队已被更新，请刷新后再操作')


def fail(exc):
    if isinstance(exc, HTTPException):
        return jsonify(message=exc.description), exc.code
    if isinstance(exc, ValueError):
        return jsonify(message=str(exc)), 400
    logging.getLogger('team_hub.api').error('team request failed: %s', type(exc).__name__)
    return jsonify(message='操作未完成，请刷新核对状态或联系管理员'), 500


def headers(response):
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


for blueprint in (bp, public_bp):
    blueprint.register_error_handler(Exception, fail)
    blueprint.after_request(headers)


@bp.get('')
@login_required
def listing():
    _, tid = identity()
    return jsonify(teams=[team_view(tid, item) for item in store.rows('''SELECT t.*,v.version published_version,v.revision published_revision FROM raccoon_teams t
        LEFT JOIN raccoon_team_versions v ON v.id=t.published_id WHERE t.tenant_id=:tid AND t.deleted_at IS NULL ORDER BY t.updated_at DESC''', tid=tid)], agents=agents(tid), workspace_id=tid)


@bp.post('')
@login_required
def create():
    uid, tid = identity(); data = body(); value = contracts.config(data); validate_avatar_file(tid, value.get('avatar')); freeze(tid, value)
    team_id = str(uuid4()); now = time.time()
    store.run('''INSERT INTO raccoon_teams(id,tenant_id,name,config,created_by,created_at,updated_at)
        VALUES(:id,:tid,:name,CAST(:config AS jsonb),:uid,:now,:now)''', id=team_id, tid=tid, name=value['name'], config=json.dumps(value), uid=uid, now=now)
    return jsonify(store.team(tid, team_id)), 201


@bp.get('/<uuid:team_id>')
@login_required
def get_team(team_id):
    _, tid = identity(); team_id = str(team_id); value = store.team(tid, team_id)
    value['versions'] = store.rows('SELECT id,version,revision,created_at FROM raccoon_team_versions WHERE tenant_id=:tid AND team_id=:id ORDER BY version DESC', tid=tid, id=team_id)
    return jsonify(team=team_view(tid, value), agents=agents(tid))


@bp.post('/<uuid:team_id>/info')
@login_required
def update_info(team_id):
    _, tid = identity(); team_id = str(team_id); data = body()
    name = contracts.string(data.get('name'), '团队名称', 80)
    description = contracts.string(data.get('description', ''), '团队简介', 400, False)
    with store.engine().begin() as c:
        t = store.team(tid, team_id, c, True); revision(data, t)
        config = dict(t['config'], name=name, description=description)
        if 'avatar' in data:
            config['avatar'] = contracts.avatar(data['avatar'])
            validate_avatar_file(tid, config['avatar'])
        c.execute(text('UPDATE raccoon_teams SET name=:name,config=CAST(:config AS jsonb),revision=revision+1,updated_at=:now WHERE id=:id'),
                  dict(id=team_id, name=name, config=json.dumps(config), now=time.time()))
    return jsonify(store.team(tid, team_id))


@bp.post('/<uuid:team_id>/copy')
@login_required
def copy_team(team_id):
    uid, tid = identity(); team_id = str(team_id); data = body(); now = time.time()
    with store.engine().begin() as c:
        t = store.team(tid, team_id, c, True); revision(data, t)
        # Copy only editable configuration, never keys, channels, runs or publications.
        value = contracts.config(t['config'])
        value['name'] = contracts.string(data.get('name', value['name'][:75]+' 副本'), '团队名称', 80)
        new_id = str(uuid4())
        c.execute(text('''INSERT INTO raccoon_teams(id,tenant_id,name,config,created_by,created_at,updated_at)
            VALUES(:id,:tid,:name,CAST(:config AS jsonb),:uid,:now,:now)'''),
            dict(id=new_id, tid=tid, name=value['name'], config=json.dumps(value), uid=uid, now=now))
    return jsonify(store.team(tid, new_id)), 201


@bp.get('/<uuid:team_id>/export')
@login_required
def export_team(team_id):
    _, tid = identity(); t = store.team(tid, str(team_id))
    value = contracts.config(t['config'])
    document = dict(kind='agent-team', version='1.0.0', team=value,
        dependencies=dict(agent_ids=list(dict.fromkeys([value['leader_id']]+[m['agent_id'] for m in value['members']]))))
    # Team DSL uses references, not embedded Agent souls or credential records.
    return jsonify(name=t['name'], revision=t['revision'], data=yaml.safe_dump(document, allow_unicode=True, sort_keys=False))


@bp.post('/<uuid:team_id>/delete')
@login_required
def delete_team(team_id):
    _, tid = identity(); team_id = str(team_id); data = body(); now = time.time()
    with store.engine().begin() as c:
        t = store.team(tid, team_id, c, True); revision(data, t)
        active = c.execute(text("SELECT 1 FROM raccoon_team_runs WHERE team_id=:id AND state IN ('queued','running') LIMIT 1"), dict(id=team_id)).first()
        if active:
            raise Conflict('团队仍有排队或运行中的任务，请先在运行日志中取消并等待任务结束，再删除')
        c.execute(text("UPDATE raccoon_channels SET enabled=false,revision=revision+1,status='disabled',updated_at=:now WHERE tenant_id=:tid AND agent_id=:id AND target_type='team'"),
                  dict(id=team_id, tid=tid, now=now))
        c.execute(text('DELETE FROM raccoon_team_keys WHERE tenant_id=:tid AND team_id=:id'), dict(tid=tid, id=team_id))
        c.execute(text('UPDATE raccoon_teams SET deleted_at=:now,revision=revision+1,updated_at=:now WHERE id=:id'), dict(id=team_id, now=now))
    return jsonify(ok=True)


@bp.post('/<uuid:team_id>')
@login_required
def configure(team_id):
    _, tid = identity(); team_id = str(team_id); data = body(); value = contracts.config(data); validate_avatar_file(tid, value.get('avatar')); freeze(tid, value)
    with store.engine().begin() as c:
        t = store.team(tid, team_id, c, True); revision(data, t)
        if 'avatar' not in data:
            value['avatar'] = t['config'].get('avatar')
        c.execute(text('UPDATE raccoon_teams SET name=:name,config=CAST(:config AS jsonb),revision=revision+1,updated_at=:now WHERE id=:id'),
                  dict(name=value['name'], config=json.dumps(value), now=time.time(), id=team_id))
    return jsonify(store.team(tid, team_id))


@bp.post('/<uuid:team_id>/publish')
@login_required
def publish(team_id):
    uid, tid = identity(); team_id = str(team_id); data = body()
    with store.engine().begin() as c:
        t = store.team(tid, team_id, c, True); revision(data, t); frozen = freeze(tid, t['config'])
        num = c.execute(text('SELECT COALESCE(MAX(version),0)+1 FROM raccoon_team_versions WHERE team_id=:id'), dict(id=team_id)).scalar()
        sid = str(uuid4()); now = time.time()
        c.execute(text('''INSERT INTO raccoon_team_versions(id,team_id,tenant_id,version,revision,config,created_by,created_at)
          VALUES(:id,:team,:tid,:version,:revision,CAST(:config AS jsonb),:uid,:now)'''),
          dict(id=sid, team=team_id, tid=tid, version=num, revision=t['revision'], config=json.dumps(frozen), uid=uid, now=now))
        c.execute(text('UPDATE raccoon_teams SET published_id=:sid,revision=revision+1,updated_at=:now WHERE id=:id'), dict(id=team_id, sid=sid, now=now))
    return jsonify(snapshot_id=sid, version=num, revision=t['revision']+1)


def submit(tid, team_id, owner, source, data, preview=False):
    store.team(tid, team_id)
    query = contracts.string(data.get('query'), '任务', 32000)
    key = request.headers.get('Idempotency-Key') or data.get('request_id')
    key = contracts.string(key, 'request_id / Idempotency-Key', 128)
    cid = contracts.uuid(data['conversation_id']) if data.get('conversation_id') else None
    conversational = data.get('conversation', False)
    if type(conversational) is not bool:
        raise BadRequest('conversation 必须为布尔值')
    previous = store.rows('SELECT id,state,snapshot_id,query,source,conversation_id,turn_number,request_hash FROM raccoon_team_runs WHERE tenant_id=:tid AND team_id=:team AND owner_key=:owner AND request_key=:key',
                          tid=tid, team=team_id, owner=owner, key=key)
    if previous:
        old = previous[0]
        original_cid = old['conversation_id'] if (old['turn_number'] or 0) > 1 else None
        original_chat = old['request_hash'] != contracts.digest(json.dumps([old['query'], old['snapshot_id']], ensure_ascii=False))
        if old['query'] != query or old['source'] != source or original_cid != cid or original_chat != bool(conversational or cid) or (data.get('snapshot_id') and data['snapshot_id'] != old['snapshot_id']):
            raise Conflict('同一请求编号不能对应不同任务或指定版本')
        # A retry after republishing must return the original accepted run.
        return old
    if cid:
        first = store.conversation(tid, team_id, cid, owner, source)[0]
        frozen, snapshot = first['config'], first['snapshot_id']
        if data.get('snapshot_id') and data['snapshot_id'] != snapshot:
            raise Conflict('同一对话需沿用开始时的版本；使用新配置请开启新对话')
    elif preview:
        t = store.team(tid, team_id)
        frozen = freeze(tid, t['config']); snapshot = 'draft:'+str(t['revision'])
    else:
        v = store.version(tid, team_id, data.get('snapshot_id'))
        frozen = v['config']; snapshot = v['id']
    return store.enqueue(tid, team_id, owner, source, query, key, snapshot, frozen, cid, conversational)


@bp.post('/<uuid:team_id>/runs')
@login_required
def create_run(team_id):
    uid, tid = identity(); data = body()
    value = submit(tid, str(team_id), 'account:'+uid, 'preview' if data.get('preview') else 'console', data, bool(data.get('preview')))
    return jsonify(id=value['id'], state=value['state'], snapshot_id=value['snapshot_id'], conversation_id=value.get('conversation_id')), 202


@bp.get('/<uuid:team_id>/conversations')
@login_required
def list_conversations(team_id):
    uid, tid = identity()
    source = 'preview' if request.args.get('preview') == 'true' else 'console'
    return jsonify(runs=store.conversations(tid, str(team_id), 'account:'+uid, source))


@bp.get('/<uuid:team_id>/conversations/<uuid:conversation_id>')
@login_required
def get_conversation(team_id, conversation_id):
    uid, tid = identity()
    source = 'preview' if request.args.get('preview') == 'true' else 'console'
    values = store.conversation(tid, str(team_id), str(conversation_id), 'account:'+uid, source)
    counts = store.rows('''SELECT s.run_id,count(*) n FROM raccoon_team_steps s JOIN raccoon_team_runs r ON r.id=s.run_id
        WHERE r.tenant_id=:tid AND r.team_id=:team AND r.owner_key=:owner AND (r.conversation_id=:cid OR r.id=:cid) GROUP BY s.run_id''',
        tid=tid, team=str(team_id), owner='account:'+uid, cid=str(conversation_id))
    counts = {r['run_id']: r['n'] for r in counts}
    for value in values:
        value['config'] = dict(agents=value['config']['agents'])
        value['steps'] = []
        value['step_count'] = counts.get(value['id'], 0)
    return jsonify(runs=values)


@bp.get('/<uuid:team_id>/runs')
@login_required
def list_runs(team_id):
    _, tid = identity()
    return jsonify(logs.listing(tid, str(team_id), request.args))


@bp.get('/<uuid:team_id>/statistics')
@login_required
def statistics(team_id):
    _, tid = identity()
    return jsonify(monitoring.summary(tid, str(team_id), request.args))


@bp.get('/<uuid:team_id>/runs/<uuid:run_id>')
@login_required
def get_run(team_id, run_id):
    _, tid = identity()
    return jsonify(store.get_run(tid, str(team_id), str(run_id)))


@bp.post('/<uuid:team_id>/runs/<uuid:run_id>/cancel')
@login_required
def cancel_run(team_id, run_id):
    _, tid = identity(); store.cancel(tid, str(team_id), str(run_id))
    return jsonify(ok=True)


@bp.route('/<uuid:team_id>/keys', methods=['GET', 'POST'])
@login_required
def keys(team_id):
    uid, tid = identity(); team_id = str(team_id); store.team(tid, team_id)
    if request.method == 'GET':
        return jsonify(keys=store.rows('SELECT id,label,suffix,created_at FROM raccoon_team_keys WHERE tenant_id=:tid AND team_id=:id ORDER BY created_at', tid=tid, id=team_id))
    data = body(); store.version(tid, team_id)
    token = 'team-'+secrets.token_urlsafe(32); kid = str(uuid4())
    store.run('''INSERT INTO raccoon_team_keys(id,tenant_id,team_id,token_hash,label,suffix,created_by,created_at)
      VALUES(:id,:tid,:team,:hash,:label,:suffix,:uid,:now)''', id=kid, tid=tid, team=team_id, hash=contracts.digest(token),
      label=contracts.string(data.get('label','业务系统'), '名称',80), suffix=token[-6:], uid=uid, now=time.time())
    return jsonify(id=kid, token=token), 201


@bp.delete('/<uuid:team_id>/keys/<uuid:key_id>')
@login_required
def revoke(team_id, key_id):
    _, tid = identity(); store.team(tid, str(team_id))
    store.run('DELETE FROM raccoon_team_keys WHERE id=:id AND tenant_id=:tid AND team_id=:team', id=str(key_id), tid=tid, team=str(team_id))
    return jsonify(ok=True)


def api_identity(team_id):
    header = request.headers.get('Authorization', '')
    if not header.startswith('Bearer ') or len(header) > 256:
        raise Unauthorized('需要团队 API Key')
    found = store.rows('SELECT * FROM raccoon_team_keys WHERE team_id=:team AND token_hash=:hash', team=team_id, hash=contracts.digest(header[7:]))
    if not found:
        raise Unauthorized('团队 API Key 无效或已撤销')
    key = found[0]
    store.team(key['tenant_id'], team_id)
    # Keys remain workspace-bound and cease working when their issuer loses membership.
    member = store.rows('''SELECT 1 FROM tenant_account_joins m JOIN accounts a ON a.id=m.account_id
        WHERE CAST(m.tenant_id AS text)=:tid AND CAST(m.account_id AS text)=:uid AND a.status='active' AND m.role IN ('owner','admin','editor')''', tid=key['tenant_id'], uid=key['created_by'])
    if not member:
        raise Forbidden('API Key 所属账号已失去工作空间权限')
    user = request.args.get('user') if request.method == 'GET' else body().get('user')
    user = contracts.string(user, 'user', 200)
    return key['tenant_id'], 'api:'+key['id']+':'+contracts.digest(user)


@public_bp.post('/<uuid:team_id>/runs')
def public_create(team_id):
    team_id = str(team_id); tid, owner = api_identity(team_id)
    value = submit(tid, team_id, owner, 'api', body())
    return jsonify(id=value['id'], state=value['state'], snapshot_id=value['snapshot_id'], conversation_id=value.get('conversation_id'), status_url=f'/v1/agent-teams/{team_id}/runs/{value["id"]}'), 202


@public_bp.get('/<uuid:team_id>/runs/<uuid:run_id>')
def public_get(team_id, run_id):
    team_id = str(team_id); tid, owner = api_identity(team_id)
    value = store.get_run(tid, team_id, str(run_id), owner)
    # Public clients see only their own run and published evidence, not server identities.
    value.pop('config', None)
    return jsonify(value)


@public_bp.post('/<uuid:team_id>/runs/<uuid:run_id>/cancel')
def public_cancel(team_id, run_id):
    team_id = str(team_id); tid, owner = api_identity(team_id)
    store.cancel(tid, team_id, str(run_id), owner)
    return jsonify(ok=True)
