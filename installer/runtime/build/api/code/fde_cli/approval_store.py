"""Persistent approvals; caller owns transactions. No tokens are stored here."""
import time
import uuid
from sqlalchemy import Table, Column, String, Integer, BigInteger, JSON, MetaData, select, update
from werkzeug.exceptions import BadRequest, Forbidden, Conflict, NotFound

metadata = MetaData()
grants = Table('raccoon_cli_grants', metadata,
    Column('id', String(36), primary_key=True),
    Column('account_id', String(36), nullable=False, index=True),
    Column('workspace_id', String(36), nullable=False, index=True),
    Column('project_id', String(36), nullable=False),
    Column('project_name', String(100), nullable=False),
    Column('purpose', String(500), nullable=False),
    Column('requested_actions', JSON, nullable=False),
    Column('actions', JSON, nullable=False),
    Column('starts_at', BigInteger, nullable=False),
    Column('expires_at', BigInteger, nullable=False),
    Column('status', String(24), nullable=False),
    Column('approved_by', String(36)),
    Column('reason', String(500), nullable=False),
    Column('created_at', BigInteger, nullable=False),
    Column('revision', Integer, nullable=False))
events = Table('raccoon_cli_grant_events', metadata,
    Column('id', String(36), primary_key=True),
    Column('grant_id', String(36), nullable=False, index=True),
    Column('actor_id', String(36), nullable=False),
    Column('kind', String(40), nullable=False),
    Column('at', BigInteger, nullable=False),
    Column('details', JSON, nullable=False))
READ = frozenset({'doctor', 'list', 'get'})
ACTIONS = READ | {'create', 'configure', 'publish'}
MAX_TTL = 7 * 86400


def record_dict(row):
    # SQLAlchemy may return quoted_name (a str subclass) as column keys.
    # Production orjson requires exact str keys, unlike Flask's default encoder.
    return {str(key): value for key, value in row.items()}


def uid(value):
    try:
        return str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise BadRequest('必须提供有效 UUID') from None


def action_set(value):
    if not isinstance(value, list) or not value or any(not isinstance(x, str) for x in value):
        raise BadRequest('actions 必须为非空动作列表')
    result = set(value)
    if not result <= ACTIONS:
        raise BadRequest('不支持的 CLI 动作')
    return result


def text(value, maximum):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise BadRequest('必填文字为空或超过长度限制')
    return value.strip()


def epoch(value):
    if type(value) is not int or value < 0:
        raise BadRequest('时间必须为 Unix 秒数')
    return value


def member_actions(role):
    if role in ('owner', 'admin', 'editor'):
        return ACTIONS
    if role == 'normal':
        return READ
    return frozenset()


class ApprovalStore:
    def __init__(self, session, clock=time.time):
        self.session, self.clock = session, clock

    def audit(self, grant_id, actor, kind, **details):
        self.session.execute(events.insert().values(id=str(uuid.uuid4()), grant_id=grant_id,
            actor_id=actor, kind=kind, at=int(self.clock()), details=details))

    def get(self, grant_id, lock=False):
        stmt = select(grants).where(grants.c.id == uid(grant_id))
        if lock:
            stmt = stmt.with_for_update()
        row = self.session.execute(stmt).mappings().first()
        if row is None:
            raise NotFound('授权记录不存在')
        return record_dict(row)

    def check_access(self, actor, workspace):
        disabled = self.session.scalar(select(access_policies.c.disabled).where(
            access_policies.c.account_id == actor, access_policies.c.workspace_id == workspace))
        if disabled:
            raise Forbidden('此账号在该空间的 CLI 准入已停用')

    def request(self, actor, workspace, role, data):
        if set(data) != {'workspace_id', 'project_id', 'project_name', 'purpose', 'actions', 'starts_at', 'expires_at'}:
            raise BadRequest('申请字段不完整或包含未知字段')
        workspace = uid(workspace)
        self.check_access(actor, workspace)
        if uid(data['workspace_id']) != workspace:
            raise Forbidden('空间不匹配')
        actions = action_set(data['actions'])
        if not actions <= member_actions(role):
            raise Forbidden('申请动作超出当前成员权限')
        start, end = epoch(data['starts_at']), epoch(data['expires_at'])
        now = int(self.clock())
        if start < now - 300 or end <= max(start, now) or end - start > MAX_TTL:
            raise BadRequest('期限必须有效且不超过 7 天')
        row = dict(id=str(uuid.uuid4()), account_id=actor, workspace_id=workspace,
            project_id=uid(data['project_id']), project_name=text(data['project_name'], 100),
            purpose=text(data['purpose'], 500), requested_actions=sorted(actions), actions=[],
            starts_at=start, expires_at=end, status='pending', approved_by=None, reason='',
            created_at=now, revision=1)
        self.session.execute(grants.insert().values(**row))
        self.audit(row['id'], actor, 'requested', actions=sorted(actions), starts_at=start, expires_at=end,
            workspace_id=workspace, project_id=row['project_id'])
        return row

    def decide(self, grant_id, actor, role, workspace, data, applicant_role):
        row = self.get(grant_id, lock=True)
        if workspace != row['workspace_id'] or role not in ('owner', 'admin', 'platform_admin') or actor == row['account_id']:
            raise Forbidden('禁止自审或越权审批')
        if row['status'] != 'pending' or data.get('revision') != row['revision']:
            raise Conflict('申请已处理或版本变化，请刷新')
        if set(data) - {'revision', 'decision', 'actions', 'starts_at', 'expires_at', 'reason'}:
            raise BadRequest('未知审批字段')
        decision = data.get('decision')
        reason = text(data.get('reason'), 500)
        if decision == 'approve':
            self.check_access(row['account_id'], workspace)
            actions = action_set(data.get('actions'))
            start, end = epoch(data.get('starts_at')), epoch(data.get('expires_at'))
            if not actions <= set(row['requested_actions']) or not actions <= member_actions(applicant_role):
                raise Forbidden('批准不能扩大申请或当前成员权限')
            if start < row['starts_at'] or end > row['expires_at'] or end <= max(start, int(self.clock())):
                raise BadRequest('批准时间只能缩减，且必须仍然有效')
            patch = dict(status='approved', actions=sorted(actions), starts_at=start, expires_at=end)
        elif decision == 'reject':
            patch = dict(status='rejected')
        else:
            raise BadRequest('未知审批决定')
        patch.update(approved_by=actor, reason=reason, revision=row['revision'] + 1)
        self.session.execute(update(grants).where(grants.c.id == row['id']).values(**patch))
        self.audit(row['id'], actor, decision, **patch)
        return dict(row, **patch)

    def check(self, grant_id, actor, workspace, project, role, action=None, lock=False):
        row = self.get(grant_id, lock=lock)
        if (row['account_id'], row['workspace_id'], row['project_id']) != (actor, workspace, project):
            raise Forbidden('授权账号、空间或项目不匹配')
        self.check_access(actor, workspace)
        now = int(self.clock())
        if row['status'] != 'approved' or not row['starts_at'] <= now < row['expires_at']:
            raise Forbidden('授权未生效、未批准、已到期或已撤销')
        effective = set(row['actions']) & member_actions(role)
        if not effective or action is not None and action not in effective:
            raise Forbidden('操作不在批准范围和当前成员权限内')
        return dict(row, effective_actions=sorted(effective))

    def revoke(self, grant_id, actor, role, workspace, reason):
        row = self.get(grant_id, lock=True)
        if workspace != row['workspace_id'] or (actor != row['account_id'] and role not in ('owner', 'admin', 'platform_admin')):
            raise Forbidden('无权撤销此授权')
        reason = text(reason, 500)
        if row['status'] in ('revoked', 'rejected'):
            return row
        patch = dict(status='revoked', reason=reason, revision=row['revision'] + 1)
        self.session.execute(update(grants).where(grants.c.id == row['id']).values(**patch))
        self.audit(row['id'], actor, 'revoked', reason=reason)
        return dict(row, **patch)

approvers = Table('raccoon_cli_approvers', metadata,
    Column('workspace_id', String(36), primary_key=True),
    Column('account_id', String(36), primary_key=True),
    Column('granted_by', String(36), nullable=False))

access_policies = Table('raccoon_cli_access_policies', metadata,
    Column('workspace_id', String(36), primary_key=True),
    Column('account_id', String(36), primary_key=True),
    Column('disabled', Integer, nullable=False))
