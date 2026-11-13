"""Pure governance rules shared by the console controllers and unit tests.

No Flask, SQLAlchemy or Dify imports: every input is a plain dict/list so the
rules can be tested without a database. Controllers translate PolicyError into
HTTP errors.

Request dicts use the stored rx_releases shape: state, assignee, visibility
('department' | 'workspace'), applicant_id, applicant_department_id,
department_id, forwarded_by.
"""
from datetime import datetime
from urllib.parse import urlsplit

SUPER_PERMISSIONS = ['release.approve', 'org.members', 'org.manage', 'audit.view', 'ops.view', 'admins.manage']
HEAD_PERMISSIONS = ['release.approve', 'org.members', 'audit.view', 'ops.view']
# Internal compatibility: older pages still gate on these for dept heads.
HEAD_COMPAT_PERMISSIONS = set(HEAD_PERMISSIONS) | {'apps.view'}

KINDS = ('agent', 'team', 'skill', 'mcp')
RANK = {'private': 0, 'department': 1, 'public': 2}
SCOPE_LABEL = {'private': '仅个人', 'department': '部门', 'public': '公共空间'}
KIND_LABEL = {'agent': '智能体', 'team': '智能体团队', 'skill': 'Skill', 'mcp': 'MCP 服务'}

PUBLISH_REQUIRED = {
    'agent': '草稿不能共享，请先发布智能体',
    'team': '草稿不能共享，请先发布智能体团队',
    'mcp': '请先完成 MCP 服务授权，再申请共享',
    'skill': '请先发布 Skill，再申请共享',
}


class PolicyError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# ---------------------------------------------------------------- roles

def descendant_ids(departments, seeds):
    """Seeds plus all descendants; cycle-safe."""
    found = set(seeds)
    children = {}
    for d in departments:
        children.setdefault(d.get('parent_id'), []).append(d['id'])
    pending = list(found)
    while pending:
        for child in children.get(pending.pop(), ()):
            if child not in found:
                found.add(child)
                pending.append(child)
    return sorted(found)


def ancestor_ids(departments, seed):
    """Seed plus all ancestors; cycle-safe."""
    parents = {d['id']: d.get('parent_id') for d in departments}
    found = []
    current = seed
    while current and current not in found:
        found.append(current)
        current = parents.get(current)
    return found


def derive_role(is_super, head_department_ids):
    if is_super:
        return 'super_admin'
    if head_department_ids:
        return 'dept_head'
    return 'member'


def build_authority(account_id, name, is_super, head_department_ids, member_department_ids, departments, enabled=True):
    heads = sorted(set(head_department_ids or []))
    role = derive_role(is_super, heads)
    names = {d['id']: d.get('name') for d in departments}
    mine = next((d for d in (member_department_ids or []) if d in names), None)
    if role == 'super_admin':
        scope, perms = sorted(names), list(SUPER_PERMISSIONS)
    elif role == 'dept_head':
        scope, perms = descendant_ids(departments, heads), list(HEAD_PERMISSIONS)
    else:
        scope, perms = [], []
    return {
        'role': role,
        'account_id': account_id,
        'name': name or '',
        'department_id': mine,
        'department_name': names.get(mine) if mine else None,
        'head_department_ids': heads,
        'scope_ids': scope,
        'departments': [{'id': d['id'], 'name': d.get('name'), 'parent_id': d.get('parent_id')} for d in departments],
        'permissions': perms,
        'enabled': bool(enabled),
        # compat keys for older controllers
        'department_ids': heads,
    }


def allows(authority, permission=None, super_only=False):
    role = authority['role']
    if role == 'super_admin':
        return True
    if super_only or role != 'dept_head':
        return False
    return permission is None or permission in HEAD_COMPAT_PERMISSIONS


# ---------------------------------------------------------------- scopes

def api_scope(stored):
    return {'workspace': 'public', 'public': 'public', 'department': 'department'}.get(stored or '', 'private')


def stored_scope(api):
    return 'workspace' if api == 'public' else api


def current_scope(is_public, has_departments):
    return 'public' if is_public else 'department' if has_departments else 'private'


def request_department(req):
    return req.get('applicant_department_id') or req.get('department_id')


def initial_assignee(requested):
    return 'super_admin' if requested == 'public' else 'dept_head'


def check_share_request(requested, current, applicant_department_id, published, kind, pending):
    """Validate a department/public share request. Returns None or raises."""
    if requested not in ('department', 'public'):
        raise PolicyError(400, '请选择有效的共享范围')
    if kind not in KINDS:
        raise PolicyError(400, '资源类型无效')
    if requested == 'department' and not applicant_department_id:
        raise PolicyError(409, '请联系超级管理员分配部门')
    if RANK[requested] <= RANK.get(current, 0):
        raise PolicyError(409, '当前已是该范围')
    if not published:
        raise PolicyError(409, PUBLISH_REQUIRED[kind])
    if pending:
        raise PolicyError(409, '该资源已有审批中的申请，请先撤回或等待处理')


def check_note(note):
    if note is None:
        return ''
    if not isinstance(note, str) or len(note.strip()) > 500:
        raise PolicyError(400, '申请说明最多 500 字')
    return note.strip()


# ---------------------------------------------------------------- approvals

def _in_scope(authority, req):
    return request_department(req) in set(authority.get('scope_ids') or [])


def can_decide(authority, req):
    if req.get('state') != 'pending' or req.get('applicant_id') == authority['account_id']:
        return False
    if authority['role'] == 'super_admin':
        return True
    return (authority['role'] == 'dept_head' and api_scope(req.get('visibility')) == 'department'
            and (req.get('assignee') or 'dept_head') == 'dept_head' and _in_scope(authority, req))


def can_forward(authority, req):
    return (authority['role'] == 'dept_head' and req.get('state') == 'pending'
            and api_scope(req.get('visibility')) == 'department'
            and (req.get('assignee') or 'dept_head') == 'dept_head' and _in_scope(authority, req))


def validate_decision(authority, req, decision, scope=None, comment=''):
    """Returns (state, approved_api_scope or None)."""
    comment = (comment or '').strip() if isinstance(comment, str) else ''
    if decision not in ('approve', 'reject', 'return'):
        raise PolicyError(400, '无效审批动作')
    if req.get('applicant_id') == authority['account_id']:
        raise PolicyError(403, '不能审批自己提交的申请')
    if req.get('state') != 'pending':
        raise PolicyError(409, '申请已处理，不能重复审批')
    requested = api_scope(req.get('visibility'))
    if requested == 'public' and authority['role'] != 'super_admin':
        raise PolicyError(403, '公共空间申请只能由超级管理员审批')
    if not can_decide(authority, req):
        raise PolicyError(403, '申请不在你的审批范围内')
    if decision != 'approve':
        if not comment:
            raise PolicyError(400, '驳回时必须填写意见')
        return ('rejected' if decision == 'reject' else 'returned'), None
    approved = scope or requested
    if approved not in ('department', 'public') or RANK[approved] > RANK[requested]:
        raise PolicyError(400, '批准范围只能收窄，不能放大')
    if requested == 'private':
        approved = None
    return 'approved', approved


def validate_forward(authority, req, comment):
    comment = comment.strip() if isinstance(comment, str) else ''
    if authority['role'] != 'dept_head':
        raise PolicyError(403, '只有部门负责人可以转审')
    if not comment:
        raise PolicyError(400, '转审时必须填写意见')
    if len(comment) > 2000:
        raise PolicyError(400, '意见过长')
    if req.get('state') != 'pending':
        raise PolicyError(409, '申请已处理，不能转审')
    if not can_forward(authority, req):
        raise PolicyError(403, '申请不在你的审批范围内')
    return comment


def visible_in_approvals(authority, req, tab):
    pending = req.get('state') == 'pending'
    if tab == 'pending' and not pending:
        return False
    if tab == 'done' and pending and authority['role'] == 'super_admin':
        return False
    if authority['role'] == 'super_admin':
        return True
    if authority['role'] != 'dept_head':
        return False
    department_request = api_scope(req.get('visibility')) == 'department'
    in_scope = _in_scope(authority, req)
    forwarded_by_me = req.get('forwarded_by') == authority['account_id']
    if pending:
        mine = department_request and in_scope and (req.get('assignee') or 'dept_head') == 'dept_head'
        if tab == 'pending':
            return mine
        forwarded = forwarded_by_me and req.get('assignee') == 'super_admin'
        return forwarded if tab == 'done' else (mine or forwarded)
    return tab != 'pending' and department_request and (in_scope or forwarded_by_me)


def request_code(created_at, rid):
    if isinstance(created_at, str):
        try:
            created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        except ValueError:
            created_at = None
    day = created_at.strftime('%Y%m%d') if created_at else '00000000'
    return f"RQ-{day}-{str(rid).replace('-', '')[:4]}"


def timeline(req, names):
    """names: account_id -> name."""
    def who(uid):
        return names.get(uid) or ''
    out = [{'action': 'submit', 'actor_name': who(req.get('applicant_id')), 'at': req.get('created_at'), 'comment': req.get('note') or ''}]
    if req.get('forwarded_at'):
        out.append({'action': 'forward', 'actor_name': who(req.get('forwarded_by')), 'at': req.get('forwarded_at'), 'comment': req.get('forward_comment') or ''})
    state = req.get('state')
    if state == 'withdrawn':
        out.append({'action': 'withdraw', 'actor_name': who(req.get('applicant_id')), 'at': req.get('decided_at'), 'comment': req.get('comment') or ''})
    elif state in ('approved', 'failed', 'stale') and req.get('reviewer_id'):
        out.append({'action': 'approve', 'actor_name': who(req.get('reviewer_id')), 'at': req.get('decided_at'), 'comment': req.get('comment') or ''})
    elif state in ('rejected', 'returned'):
        out.append({'action': 'reject', 'actor_name': who(req.get('reviewer_id')), 'at': req.get('decided_at'), 'comment': req.get('comment') or ''})
    return out


def mask_url(url):
    """Keep scheme + host(:port); hide path, query, fragment and userinfo."""
    try:
        parts = urlsplit(url or '')
    except ValueError:
        return '***'
    if not parts.scheme or not parts.hostname:
        return '***' if url else ''
    host = parts.hostname
    try:
        if parts.port:
            host = f'{host}:{parts.port}'
    except ValueError:
        pass
    masked = f'{parts.scheme}://{host}'
    if parts.path not in ('', '/') or parts.query or parts.fragment:
        masked += '/***'
    return masked


# ---------------------------------------------------------------- audit

AUDIT_CATEGORIES = ['发布申请', '审批处理', '权限变更', '组织变更', '技术栈配置', '登录']

_EXACT = {
    'release.submit': '发布申请', 'release.withdraw': '发布申请', 'release.private': '发布申请',
    'resource.visibility': '发布申请', 'share.submit': '发布申请', 'share.withdraw': '发布申请', 'share.private': '发布申请',
    'release.approve': '审批处理', 'release.reject': '审批处理', 'release.return': '审批处理', 'release.forward': '审批处理',
    'admin.assign': '权限变更', 'admin.revoke': '权限变更', 'super.grant': '权限变更', 'super.revoke': '权限变更',
    'head.set': '权限变更', 'head.remove': '权限变更', 'role.create': '权限变更',
    'department.create': '组织变更', 'department.update': '组织变更', 'department.rename': '组织变更',
    'department.move': '组织变更', 'department.delete': '组织变更',
    'member.departments': '组织变更', 'member.department': '组织变更',
    'login.success': '登录', 'login.failure': '登录',
}
_PREFIX = (('stack.', '技术栈配置'), ('techstack.', '技术栈配置'))

_SUMMARY = {
    'release.submit': '提交共享申请', 'release.withdraw': '撤回申请', 'release.private': '改为仅个人',
    'resource.visibility': '改为仅个人', 'release.approve': '通过申请', 'release.reject': '驳回申请',
    'release.return': '退回申请', 'release.forward': '转审超级管理员', 'admin.assign': '任命管理员',
    'admin.revoke': '撤销管理员', 'super.grant': '任命超级管理员', 'super.revoke': '撤销超级管理员',
    'head.set': '设置部门负责人', 'head.remove': '移除部门负责人', 'role.create': '新建管理员角色',
    'department.create': '新建部门', 'department.update': '修改部门', 'department.rename': '重命名部门',
    'department.move': '移动部门', 'department.delete': '删除部门', 'member.departments': '调整成员部门',
    'member.department': '调整成员部门', 'login.success': '登录成功', 'login.failure': '登录失败',
}


def audit_category(action, detail=None):
    if detail and detail.get('category') in AUDIT_CATEGORIES:
        return detail['category']
    if action in _EXACT:
        return _EXACT[action]
    for prefix, category in _PREFIX:
        if (action or '').startswith(prefix):
            return category
    return None


def audit_summary(action, detail=None):
    detail = detail or {}
    category = audit_category(action, detail)
    text = detail.get('summary') or _SUMMARY.get(action) or ''
    return f'{category} · {text}' if category and text else (category or text)


def audit_visible(authority, record, actor_department_ids):
    if authority['role'] == 'super_admin':
        return True
    if authority['role'] != 'dept_head':
        return False
    scope = set(authority.get('scope_ids') or [])
    return bool(scope.intersection(actor_department_ids or [])) or record.get('department_id') in scope


def audit_matches(row, actor='', category='', department_id='', result='', keyword=''):
    """row: {actor_name, category, department_id, result, object_name}."""
    if actor and row.get('actor_name') != actor:
        return False
    if category and row.get('category') != category:
        return False
    if department_id and row.get('department_id') != department_id:
        return False
    if result and row.get('result') != result:
        return False
    if keyword and keyword.lower() not in (row.get('object_name') or '').lower():
        return False
    return True
