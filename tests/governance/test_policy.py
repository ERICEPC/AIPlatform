import pytest

from services.platform_governance import policy as P
from services.platform_organization.service import build_org_view

# 渠道部(root) -> 北区东区 -> 北区一组 ; root -> 南区 ; FDE
DEPTS = [
    {'id': 'root', 'name': '大模型生态渠道部', 'parent_id': None},
    {'id': 'north', 'name': '北区东区', 'parent_id': 'root'},
    {'id': 'north1', 'name': '北区一组', 'parent_id': 'north'},
    {'id': 'south', 'name': '南区', 'parent_id': 'root'},
    {'id': 'fde', 'name': 'FDE 交付中心', 'parent_id': 'root'},
]


def auth(uid, is_super=False, heads=(), dept=None):
    return P.build_authority(uid, uid, is_super, list(heads), [dept] if dept else [], DEPTS)


SUPER = auth('super', is_super=True, dept='fde')
SUPER2 = auth('super2', is_super=True, dept='fde')
HEAD = auth('head', heads=['north'], dept='north')
MEMBER = auth('member', dept='north1')


def req(**kw):
    base = {'id': 'r1', 'state': 'pending', 'visibility': 'department', 'assignee': 'dept_head',
            'applicant_id': 'member', 'applicant_department_id': 'north1', 'department_id': 'north1', 'forwarded_by': None}
    base.update(kw)
    return base


# ---------------------------------------------------------------- roles

def test_role_derivation():
    assert SUPER['role'] == 'super_admin'
    assert HEAD['role'] == 'dept_head'
    assert MEMBER['role'] == 'member'
    # super wins over head
    assert auth('x', is_super=True, heads=['north'])['role'] == 'super_admin'


def test_authority_shape_and_permissions():
    assert SUPER['scope_ids'] == sorted(d['id'] for d in DEPTS)
    assert SUPER['permissions'] == ['release.approve', 'org.members', 'org.manage', 'audit.view', 'ops.view', 'admins.manage']
    assert HEAD['permissions'] == ['release.approve', 'org.members', 'audit.view', 'ops.view']
    assert MEMBER['permissions'] == [] and MEMBER['scope_ids'] == []
    assert MEMBER['department_id'] == 'north1' and MEMBER['department_name'] == '北区一组'
    assert len(HEAD['departments']) == len(DEPTS)
    assert set(HEAD) >= {'role', 'account_id', 'name', 'department_id', 'department_name', 'head_department_ids',
                         'scope_ids', 'departments', 'permissions', 'enabled'}


def test_head_scope_includes_descendants_only():
    assert HEAD['scope_ids'] == ['north', 'north1']
    assert HEAD['head_department_ids'] == ['north']


def test_member_one_department_first_row():
    a = P.build_authority('u', 'u', False, [], ['south', 'north'], DEPTS)
    assert a['department_id'] == 'south'


def test_descendants_cycle_safe():
    cyclic = [{'id': 'a', 'parent_id': 'b'}, {'id': 'b', 'parent_id': 'a'}]
    assert P.descendant_ids(cyclic, ['a']) == ['a', 'b']
    assert P.ancestor_ids(cyclic, 'a') == ['a', 'b']
    assert P.ancestor_ids(DEPTS, 'north1') == ['north1', 'north', 'root']


def test_allows():
    assert P.allows(SUPER, super_only=True)
    assert not P.allows(HEAD, super_only=True)
    assert P.allows(HEAD, 'ops.view') and P.allows(HEAD, 'apps.view') and P.allows(HEAD, 'release.approve')
    assert not P.allows(HEAD, 'admins.manage')
    assert not P.allows(MEMBER, 'ops.view') and not P.allows(MEMBER)


# ---------------------------------------------------------------- requests

def test_scope_mapping():
    assert P.api_scope('workspace') == 'public'
    assert P.api_scope('department') == 'department'
    assert P.api_scope('private') == 'private'
    assert P.stored_scope('public') == 'workspace'
    assert P.initial_assignee('public') == 'super_admin'
    assert P.initial_assignee('department') == 'dept_head'


def test_share_request_validation():
    P.check_share_request('department', 'private', 'north', True, 'agent', False)
    P.check_share_request('public', 'department', None, True, 'mcp', False)  # public needs no department
    with pytest.raises(P.PolicyError) as e:
        P.check_share_request('department', 'private', None, True, 'agent', False)
    assert e.value.status == 409 and e.value.message == '请联系超级管理员分配部门'
    with pytest.raises(P.PolicyError, match='当前已是该范围'):
        P.check_share_request('department', 'department', 'north', True, 'agent', False)
    with pytest.raises(P.PolicyError, match='当前已是该范围'):
        P.check_share_request('department', 'public', 'north', True, 'agent', False)
    for kind, message in P.PUBLISH_REQUIRED.items():
        with pytest.raises(P.PolicyError, match=message):
            P.check_share_request('public', 'private', 'north', False, kind, False)
    with pytest.raises(P.PolicyError) as e:
        P.check_share_request('public', 'private', 'north', True, 'skill', True)
    assert e.value.status == 409


def test_note_limit():
    assert P.check_note(None) == ''
    assert P.check_note(' 说明 ') == '说明'
    with pytest.raises(P.PolicyError):
        P.check_note('x' * 501)


# ---------------------------------------------------------------- approvals

def test_department_request_routing():
    r = req()
    assert P.can_decide(HEAD, r) and P.can_forward(HEAD, r)
    assert P.can_decide(SUPER, r) and not P.can_forward(SUPER, r)
    assert not P.can_decide(MEMBER, r)
    south_head = auth('sh', heads=['south'], dept='south')
    assert not P.can_decide(south_head, r) and not P.can_forward(south_head, r)


def test_public_request_super_only():
    r = req(visibility='workspace', assignee='super_admin')
    assert P.can_decide(SUPER, r)
    assert not P.can_decide(HEAD, r) and not P.can_forward(HEAD, r)
    with pytest.raises(P.PolicyError) as e:
        P.validate_decision(HEAD, r, 'approve', None, '')
    assert e.value.status == 403


def test_no_self_approval():
    own = req(applicant_id='super', applicant_department_id='fde', department_id='fde', visibility='workspace')
    assert not P.can_decide(SUPER, own)
    with pytest.raises(P.PolicyError) as e:
        P.validate_decision(SUPER, own, 'approve')
    assert e.value.status == 403 and e.value.message == '不能审批自己提交的申请'
    assert P.validate_decision(SUPER2, own, 'approve') == ('approved', 'public')
    head_own = req(applicant_id='head', applicant_department_id='north', department_id='north')
    assert not P.can_decide(HEAD, head_own)
    assert P.can_forward(HEAD, head_own)  # a head can only forward their own request
    assert P.validate_forward(HEAD, head_own, '请超管审批') == '请超管审批'


def test_narrowing_only():
    pub = req(visibility='workspace', assignee='super_admin')
    assert P.validate_decision(SUPER, pub, 'approve', 'department') == ('approved', 'department')
    assert P.validate_decision(SUPER, pub, 'approve') == ('approved', 'public')
    with pytest.raises(P.PolicyError, match='收窄'):
        P.validate_decision(SUPER, req(), 'approve', 'public')
    with pytest.raises(P.PolicyError):
        P.validate_decision(SUPER, pub, 'approve', 'private')


def test_reject_needs_comment_and_state():
    with pytest.raises(P.PolicyError) as e:
        P.validate_decision(HEAD, req(), 'reject', None, '  ')
    assert e.value.status == 400
    assert P.validate_decision(HEAD, req(), 'reject', None, '不合规') == ('rejected', None)
    with pytest.raises(P.PolicyError) as e:
        P.validate_decision(HEAD, req(state='approved'), 'approve')
    assert e.value.status == 409
    with pytest.raises(P.PolicyError):
        P.validate_decision(HEAD, req(), 'bogus')


def test_forward_rules():
    with pytest.raises(P.PolicyError, match='必须填写'):
        P.validate_forward(HEAD, req(), '')
    with pytest.raises(P.PolicyError) as e:
        P.validate_forward(SUPER, req(), 'x')
    assert e.value.status == 403
    forwarded = req(assignee='super_admin', forwarded_by='head')
    assert not P.can_decide(HEAD, forwarded) and not P.can_forward(HEAD, forwarded)
    assert P.can_decide(SUPER, forwarded)
    with pytest.raises(P.PolicyError):
        P.validate_decision(HEAD, forwarded, 'approve')


def test_approval_list_visibility():
    pending = req()
    forwarded = req(id='r2', assignee='super_admin', forwarded_by='head')
    public = req(id='r3', visibility='workspace', assignee='super_admin')
    done = req(id='r4', state='approved')
    other = req(id='r5', applicant_department_id='south', department_id='south')
    rows = [pending, forwarded, public, done, other]
    ids = lambda a, tab: [r['id'] for r in rows if P.visible_in_approvals(a, r, tab)]
    assert ids(SUPER, 'pending') == ['r1', 'r2', 'r3', 'r5']
    assert ids(SUPER, 'done') == ['r4']
    assert ids(HEAD, 'pending') == ['r1']
    assert ids(HEAD, 'done') == ['r2', 'r4']
    assert ids(HEAD, 'all') == ['r1', 'r2', 'r4']
    assert ids(MEMBER, 'all') == []


def test_timeline_and_code():
    from datetime import datetime, timezone
    r = req(state='approved', reviewer_id='super', created_at='2026-11-13T01:00:00+00:00', note='n',
            forwarded_by='head', forwarded_at='t2', forward_comment='fw', decided_at='t3', comment='ok')
    t = P.timeline(r, {'member': '周莹', 'head': '蒋磊', 'super': '李鹏程'})
    assert [x['action'] for x in t] == ['submit', 'forward', 'approve']
    assert t[1]['actor_name'] == '蒋磊' and t[2]['comment'] == 'ok'
    assert [x['action'] for x in P.timeline(req(state='withdrawn', decided_at='t'), {})] == ['submit', 'withdraw']
    assert [x['action'] for x in P.timeline(req(state='rejected', reviewer_id='head'), {})][-1] == 'reject'
    assert P.request_code(datetime(2026, 11, 13, tzinfo=timezone.utc), '1a2b3c4d-0000') == 'RQ-20261113-1a2b'


def test_mask_url():
    assert P.mask_url('https://user:pw@mcp.example.com:8443/sse?token=abc') == 'https://mcp.example.com:8443/***'
    assert P.mask_url('https://mcp.example.com') == 'https://mcp.example.com'
    assert P.mask_url('') == ''
    assert 'secret' not in P.mask_url('http://h/x/secret')


# ---------------------------------------------------------------- audit

def test_audit_categories():
    assert P.audit_category('release.submit') == '发布申请'
    assert P.audit_category('release.private') == '发布申请'
    assert P.audit_category('release.withdraw') == '发布申请'
    assert P.audit_category('release.forward') == '审批处理'
    assert P.audit_category('release.reject') == '审批处理'
    assert P.audit_category('admin.assign') == '权限变更'
    assert P.audit_category('head.set') == '权限变更'
    assert P.audit_category('department.delete') == '组织变更'
    assert P.audit_category('member.departments') == '组织变更'
    assert P.audit_category('stack.update') == '技术栈配置'
    assert P.audit_category('login.failure') == '登录'
    # non-human or unknown actions are excluded
    assert P.audit_category('application.create') is None
    assert P.audit_category('salesbuddy.cli.publish') is None
    assert P.audit_category('permission.denied') is None
    assert P.audit_summary('release.forward', {}) == '审批处理 · 转审超级管理员'
    assert P.audit_summary('release.submit', {'summary': '申请共享到公共空间'}) == '发布申请 · 申请共享到公共空间'


def test_audit_scoping():
    rec_north = {'department_id': 'north1'}
    rec_south = {'department_id': 'south'}
    assert P.audit_visible(SUPER, rec_south, [])
    assert P.audit_visible(HEAD, rec_north, [])
    assert not P.audit_visible(HEAD, rec_south, ['south'])
    assert P.audit_visible(HEAD, rec_south, ['north1'])  # actor in scope
    assert not P.audit_visible(MEMBER, rec_north, ['north1'])


def test_audit_filters():
    row = {'actor_name': '叶源', 'category': '登录', 'department_id': 'fde', 'result': 'success', 'object_name': '客户拜访复盘助手'}
    assert P.audit_matches(row, actor='叶源', category='登录', department_id='fde', result='success', keyword='拜访')
    assert not P.audit_matches(row, actor='蒋磊')
    assert not P.audit_matches(row, result='denied')
    assert not P.audit_matches(row, keyword='不存在')


# ---------------------------------------------------------------- org

def test_org_view_scoping():
    members = [{'id': 'super', 'name': 'S', 'email': 's@x', 'last_login_at': None},
               {'id': 'head', 'name': 'H', 'email': 'h@x', 'last_login_at': None},
               {'id': 'member', 'name': 'M', 'email': 'm@x', 'last_login_at': None},
               {'id': 'new', 'name': 'N', 'email': 'n@x', 'last_login_at': None}]
    memberships = [{'account_id': 'super', 'department_id': 'fde'}, {'account_id': 'head', 'department_id': 'north'},
                   {'account_id': 'member', 'department_id': 'north1'}]
    heads = [{'department_id': 'north', 'account_id': 'head'}]
    full = build_org_view(DEPTS, members, memberships, heads, ['super'], SUPER)
    assert not full['readonly'] and len(full['members']) == 4 and len(full['departments']) == 5
    roles = {m['id']: m['role'] for m in full['members']}
    assert roles == {'super': 'super_admin', 'head': 'dept_head', 'member': 'member', 'new': 'member'}
    assert next(d for d in full['departments'] if d['id'] == 'north')['head_ids'] == ['head']
    part = build_org_view(DEPTS, members, memberships, heads, ['super'], HEAD)
    assert part['readonly'] and {d['id'] for d in part['departments']} == {'north', 'north1'}
    assert {m['id'] for m in part['members']} == {'head', 'member'}
