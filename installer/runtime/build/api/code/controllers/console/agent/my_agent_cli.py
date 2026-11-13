"""Account-authenticated CLI for owned, non-enterprise Agents."""
from uuid import UUID
from flask import request
from flask_restx import Resource
from sqlalchemy import select, text, func
from werkzeug.exceptions import BadRequest, Forbidden, NotFound, Conflict
from controllers.console import console_ns
from .personal import auth, read_state
from .personal_agent_cli import dispatch, create_draft, authorized_user
from .governance import audit
from models.agent import Agent, AgentStatus
from models.model import App, ApiToken
from models.enums import ApiTokenType
from core.agent.publish_visibility import agent_has_workflow_callable_active_snapshot


@console_ns.route('/agent-cli')
class MyAgentCLI(Resource):
    @auth
    def post(self, session, tenant_id, current_user):
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            raise BadRequest('请求必须是 JSON 对象')
        action = body.get('action')
        if action not in ('whoami', 'create', 'list', 'resources', 'get', 'update', 'publish', 'status', 'key-create', 'key-revoke'):
            raise BadRequest('不支持的 CLI 操作')
        scope = {'t': tenant_id, 'u': current_user.id,
                 'r': read_state(session, tenant_id, current_user.id)['revision']}
        authorized_user(session, scope)
        enterprise = set(session.scalars(text('SELECT agent_id FROM rx_buddy_agents WHERE tenant_id=:t AND active=true'), {'t': tenant_id}))
        if action == 'whoami':
            return {'account_id': current_user.id, 'name': current_user.name,
                    'email': current_user.email, 'tenant_id': tenant_id, 'scope': 'agents/mine'}
        if action == 'create':
            spec = {k: v for k, v in body.items() if k != 'action'}
            existing = session.scalar(select(Agent).where(Agent.tenant_id == tenant_id,
                Agent.created_by == current_user.id, Agent.name == spec.get('name'), Agent.status == AgentStatus.ACTIVE))
            if existing and (str(existing.id) in enterprise or str(existing.source) == 'system'):
                raise Conflict('名称与企服智能体重复，请换一个名称')
            session.commit()
            return create_draft(scope, spec)
        if action not in ('list', 'resources'):
            try:
                aid = str(UUID(body.get('id', '')))
            except (ValueError, TypeError, AttributeError):
                raise BadRequest('智能体 ID 无效') from None
            agent = session.scalar(select(Agent).where(Agent.id == aid, Agent.tenant_id == tenant_id,
                Agent.created_by == current_user.id, Agent.status == AgentStatus.ACTIVE,
                Agent.scope == 'roster', Agent.app_id.is_not(None)).with_for_update())
            if not agent or aid in enterprise or str(agent.source) == 'system':
                raise NotFound('智能体不存在或不属于当前账号的“我的”')
            if action in ('key-create', 'key-revoke'):
                allowed = {'action', 'id'} | ({'key_id'} if action == 'key-revoke' else set())
                if set(body) - allowed:
                    raise BadRequest('不支持的字段')
                app = session.get(App, agent.app_id)
                if action == 'key-revoke':
                    key = session.scalar(select(ApiToken).where(ApiToken.id == body.get('key_id'),
                        ApiToken.app_id == app.id, ApiToken.tenant_id == tenant_id, ApiToken.type == ApiTokenType.APP))
                    if not key:
                        raise NotFound('API Key 不存在')
                    session.delete(key)
                    audit(session, tenant_id, current_user.id, 'agent.cli.key.revoke', aid, detail={'key_id': body['key_id']})
                    session.commit()
                    return {'revoked': True, 'key_id': body['key_id']}
                if not app.enable_api or not agent_has_workflow_callable_active_snapshot(session=session, agent=agent):
                    raise Conflict('请先发布并启用 API；待审批状态不能生成调用密钥')
                count = session.scalar(select(func.count(ApiToken.id)).where(ApiToken.app_id == app.id, ApiToken.type == ApiTokenType.APP))
                if count >= 10:
                    raise Conflict('API Key 已达到 10 个上限')
                key = ApiToken(app_id=app.id, tenant_id=tenant_id, type=ApiTokenType.APP,
                               token=ApiToken.generate_api_key('app-', 24, session=session))
                session.add(key); session.flush()
                audit(session, tenant_id, current_user.id, 'agent.cli.key.create', aid, detail={'key_id': key.id})
                result = {'id': key.id, 'agent_id': aid, 'api_key': key.token, 'api_base_url': app.api_base_url}
                session.commit()
                return result
        session.commit()  # dispatch owns its transaction; do not retain row locks
        result = dispatch(scope, body)
        if action == 'list':
            system = set(session.scalars(select(Agent.id).where(Agent.tenant_id == tenant_id, Agent.source == 'system')))
            result['agents'] = [a for a in result['agents'] if str(a['id']) not in enterprise | set(map(str, system))]
        return result
