"""Browser-only approval endpoints, sharing the platform cookie and CSRF checks."""
from pathlib import Path
from sqlalchemy import select, delete, update
from werkzeug.exceptions import Forbidden, BadRequest
from flask import request, jsonify
from fde_cli.approval_store import ApprovalStore, grants, events, approvers, access_policies, uid, record_dict


def install(api):
    bp = api.bp

    def reviewer_role(account, workspace):
        if account['role'] in ('owner', 'platform_admin'):
            return account['role']
        if account['role'] == 'admin':
            with api.approval_session() as session:
                delegated = session.execute(select(approvers).where(approvers.c.workspace_id == workspace,
                    approvers.c.account_id == account['id'])).first()
            if delegated:
                return 'admin'
        return 'editor'

    @bp.post('/approvals/approvers')
    def delegate_reviewer():
        data = api.obj()
        if set(data) != {'workspace_id', 'account_id', 'enabled'} or type(data['enabled']) is not bool:
            raise BadRequest('审批权限设置参数无效')
        workspace, target = uid(data['workspace_id']), uid(data['account_id'])
        actor = api.browser_account(mutate=True, workspace=workspace)
        if actor['role'] not in ('owner', 'platform_admin'):
            raise Forbidden('只有空间 Owner 可以指定 CLI 审批管理员')
        if data['enabled'] and api.allowed(target, workspace)['role'] != 'admin':
            raise Forbidden('只能委派当前空间管理员')
        with api.approval_session() as session:
            # Serialize policy changes for the target workspace against each other.
            session.execute(select(api.Tenant).where(api.Tenant.id == workspace).with_for_update())
            session.execute(delete(approvers).where(approvers.c.workspace_id == workspace, approvers.c.account_id == target))
            if data['enabled']:
                session.execute(approvers.insert().values(workspace_id=workspace, account_id=target, granted_by=actor['id']))
            ApprovalStore(session).audit(workspace, actor['id'], 'reviewer_changed', account_id=target, enabled=data['enabled'])
            session.commit()
        return jsonify(ok=True, data=dict(updated=True))

    @bp.post('/approvals/access')
    def set_access():
        data = api.obj()
        if set(data) != {'workspace_id', 'account_id', 'enabled', 'reason'} or type(data['enabled']) is not bool:
            raise BadRequest('准入设置参数无效')
        workspace, target = uid(data['workspace_id']), uid(data['account_id'])
        actor = api.browser_account(mutate=True, workspace=workspace)
        if reviewer_role(actor, workspace) not in ('owner', 'admin', 'platform_admin'):
            raise Forbidden('无权管理 CLI 准入')
        from fde_cli.approval_store import text
        reason = text(data['reason'], 500)
        with api.approval_session() as session:
            # Serialize grant creation/approval and access changes using identity row.
            target_account = session.scalar(select(api.Account).where(api.Account.id == target).with_for_update())
            if target_account is None:
                raise BadRequest('账号不存在')
            session.execute(delete(access_policies).where(access_policies.c.workspace_id == workspace, access_policies.c.account_id == target))
            session.execute(access_policies.insert().values(workspace_id=workspace, account_id=target, disabled=int(not data['enabled'])))
            store = ApprovalStore(session)
            if not data['enabled']:
                rows = session.execute(select(grants).where(grants.c.account_id == target, grants.c.workspace_id == workspace,
                    grants.c.status.in_(['pending', 'approved'])).order_by(grants.c.id).with_for_update()).mappings().all()
                for row in rows:
                    session.execute(update(grants).where(grants.c.id == row['id']).values(status='revoked', reason=reason, revision=row['revision']+1))
                    store.audit(row['id'], actor['id'], 'access_disabled', reason=reason)
            store.audit(workspace, actor['id'], 'access_changed', account_id=target, enabled=data['enabled'], reason=reason)
            session.commit()
        return jsonify(ok=True, data=dict(updated=True))

    @bp.get('/approvals/context')
    def approval_context():
        workspace = uid(request.args.get('workspace_id'))
        account = api.browser_account(workspace=workspace)
        return jsonify(ok=True, data=dict(account=account, workspace_id=workspace,
            workspace=api.workspace_name(workspace), can_approve=reviewer_role(account, workspace) in ('owner', 'admin', 'platform_admin'),
            max_ttl_seconds=604800))

    @bp.get('/approvals')
    def approval_list():
        workspace = uid(request.args.get('workspace_id'))
        account = api.browser_account(workspace=workspace)
        try:
            offset = int(request.args.get('offset', 0))
            if not 0 <= offset <= 100000:
                raise ValueError()
        except ValueError:
            raise BadRequest('无效分页') from None
        stmt = select(grants).where(grants.c.workspace_id == workspace)
        if request.args.get('view') == 'space':
            if reviewer_role(account, workspace) not in ('owner', 'admin', 'platform_admin'):
                raise Forbidden('仅空间管理员可查看空间授权')
        else:
            stmt = stmt.where(grants.c.account_id == account['id'])
        with api.approval_session() as session:
            rows = [record_dict(x) for x in session.execute(stmt.order_by(grants.c.created_at.desc(), grants.c.id).offset(offset).limit(50)).mappings()]
        return jsonify(ok=True, data=dict(items=rows, offset=offset, limit=50))

    @bp.post('/approvals')
    def approval_create():
        data = api.obj()
        workspace = uid(data.get('workspace_id'))
        account = api.browser_account(mutate=True, workspace=workspace)
        api.limit('application:' + account['id'], 10, 60)
        with api.approval_session() as session:
            session.execute(select(api.Account).where(api.Account.id == account['id']).with_for_update())
            result = ApprovalStore(session).request(account['id'], workspace, account['role'], data)
            session.commit()
        return jsonify(ok=True, data=result), 201

    def authorize_record(grant_id):
        # Read target scope from the record, never from an asserted administrator scope.
        with api.approval_session() as session:
            row = ApprovalStore(session).get(grant_id)
        account = api.browser_account(mutate=request.method == 'POST', workspace=row['workspace_id'])
        return row, account

    @bp.post('/approvals/<grant_id>/decision')
    def approval_decision(grant_id):
        row, actor = authorize_record(grant_id)
        if reviewer_role(actor, row['workspace_id']) not in ('owner', 'admin', 'platform_admin') or actor['id'] == row['account_id']:
            raise Forbidden('禁止自审或越权审批')
        data = api.obj()
        applicant_role = ''
        if data.get('decision') == 'approve':
            applicant_role = api.allowed(row['account_id'], row['workspace_id'])['role']
        with api.approval_session() as session:
            session.execute(select(api.Account).where(api.Account.id == row['account_id']).with_for_update())
            result = ApprovalStore(session).decide(grant_id, actor['id'], reviewer_role(actor, row['workspace_id']), row['workspace_id'], data, applicant_role)
            session.commit()
        return jsonify(ok=True, data=result)

    @bp.post('/approvals/<grant_id>/revoke')
    def approval_revoke(grant_id):
        row, actor = authorize_record(grant_id)
        data = api.obj()
        if set(data) != {'reason'}:
            raise BadRequest('仅接受撤销原因')
        with api.approval_session() as session:
            result = ApprovalStore(session).revoke(grant_id, actor['id'], reviewer_role(actor, row['workspace_id']), row['workspace_id'], data['reason'])
            session.commit()
        return jsonify(ok=True, data=result)

    @bp.get('/approvals/<grant_id>/events')
    def approval_events(grant_id):
        row, actor = authorize_record(grant_id)
        if actor['id'] != row['account_id'] and reviewer_role(actor, row['workspace_id']) not in ('owner', 'admin', 'platform_admin'):
            raise Forbidden('无权查看此审计记录')
        with api.approval_session() as session:
            rows = [record_dict(x) for x in session.execute(select(events).where(events.c.grant_id == row['id']).order_by(events.c.at.desc()).limit(200)).mappings()]
        return jsonify(ok=True, data=dict(items=rows, limit=200))

    @bp.get('/approval-center')
    def approval_page():
        return Path(__file__).with_name('approval-center.html').read_text(), 200, {'Content-Type': 'text/html; charset=utf-8'}

    @bp.get('/approval-center.js')
    def approval_script():
        return Path(__file__).with_name('approval-center.js').read_text(), 200, {'Content-Type': 'application/javascript'}
