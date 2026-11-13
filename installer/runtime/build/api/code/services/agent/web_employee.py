"""Bind published Agent visitors to a verified console account, never the owner."""
from uuid import NAMESPACE_URL, uuid5

from flask import request
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from werkzeug.exceptions import Forbidden

from core.db.session_factory import session_factory
from libs.passport import PassportService
from libs.token import check_csrf_token, extract_console_cookie_token
from models.account import Account, AccountStatus, Tenant, TenantAccountJoin, TenantStatus
from models.enums import EndUserType
from models.model import EndUser


def employee_visitor_id(app_id, account_id):
    return str(uuid5(NAMESPACE_URL, f'raccoonx:published-agent:{app_id}:{account_id}'))


def require_member(session, tenant_id, account_id):
    account = session.get(Account, account_id)
    tenant = session.get(Tenant, tenant_id)
    joined = session.scalar(select(TenantAccountJoin.id).where(
        TenantAccountJoin.tenant_id == tenant_id, TenantAccountJoin.account_id == account_id))
    if not account or account.status != AccountStatus.ACTIVE or not tenant or tenant.status != TenantStatus.NORMAL or not joined:
        raise Forbidden('当前账号没有此工作空间的访问权限，请使用有权限的员工账号登录。')
    return account


def bind_employee_visitor(app_model, visitor):
    if app_model.mode != 'agent':
        return visitor
    token = extract_console_cookie_token(request)
    if not token:
        return visitor
    try:
        claims = PassportService().verify(token)
    except Exception:
        raise Forbidden('平台登录已失效，请重新登录 Raccoon X 后刷新此页面。') from None
    account_id = claims.get('user_id')
    if claims.get('token_source') or not account_id:
        raise Forbidden('无法确认平台登录身份，请重新登录 Raccoon X。')
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        check_csrf_token(request, account_id)
    with session_factory.create_session() as session:
        account = require_member(session, app_model.tenant_id, account_id)
        visitor_id = employee_visitor_id(app_model.id, account.id)
        session.execute(insert(EndUser.__table__).values(
            id=visitor_id, tenant_id=app_model.tenant_id, app_id=app_model.id,
            type=EndUserType.BROWSER, external_user_id=account.id,
            session_id='employee:' + account.id, name=account.name, is_anonymous=False,
        ).on_conflict_do_nothing(index_elements=['id']))
        session.commit()
        bound = session.get(EndUser, visitor_id)
        session.expunge(bound)
        return bound


def knowledge_account_id(tenant_id, app_id, visitor_id, invoke_from):
    # Only browser visitors created by the verified-cookie binding above qualify.
    # API user strings and anonymous passports cannot grant employee authority.
    if getattr(invoke_from, 'value', invoke_from) != 'web-app':
        raise Forbidden('此外部知识库需要员工身份；API 调用尚未绑定员工知识库授权。')
    with session_factory.create_session() as session:
        visitor = session.get(EndUser, visitor_id)
        account_id = visitor.external_user_id if visitor else None
        if (not account_id or visitor.tenant_id != tenant_id or visitor.app_id != app_id
                or visitor.type != EndUserType.BROWSER or visitor.session_id != 'employee:' + account_id
                or visitor.id != employee_visitor_id(app_id, account_id)):
            raise Forbidden('此智能体使用员工知识库，请先登录 Raccoon X，再刷新此页面并开启新对话。')
        require_member(session, tenant_id, account_id)
        return account_id
