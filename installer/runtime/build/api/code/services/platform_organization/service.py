"""Build the existing organization response with a bounded number of queries."""


def organization_directory(repository, tenant, principal):
    departments = repository.departments(tenant)
    superuser = principal['role'] == 'super_admin'
    scope = set(principal['scope_ids'])
    if not superuser:
        departments = [d for d in departments if d['id'] in scope]
    members = repository.members(tenant)
    if not members:
        return {'departments': departments, 'members': []}
    memberships = {}
    for row in repository.memberships(tenant):
        memberships.setdefault(row['account_id'], []).append(row['department_id'])
    visible = [(m, memberships.get(m['id'], [])) for m in members]
    if not superuser:
        visible = [(m, ids) for m, ids in visible if scope.intersection(ids)]
    if not visible:
        return {'departments': departments, 'members': []}
    roles = {r['account_id']: 'super_admin' if r['role_id'] == 'role-super' else 'admin'
             for r in repository.roles(tenant)}
    return {'departments': departments, 'members': [
        {**m, 'department_ids': ids, 'role': roles.get(m['id'], 'developer')}
        for m, ids in visible]}


def build_org_view(departments, members, memberships, heads, supers, principal):
    """Pure assembly of the /admin/org response (one department per member)."""
    superuser = principal['role'] == 'super_admin'
    scope = set(principal.get('scope_ids') or [])
    primary = {}
    for row in sorted(memberships, key=lambda r: (r['account_id'], r['department_id'])):
        primary.setdefault(row['account_id'], row['department_id'])
    head_map, head_accounts = {}, set()
    for row in heads:
        head_map.setdefault(row['department_id'], []).append(row['account_id'])
        head_accounts.add(row['account_id'])
    supers = set(supers)
    counts = {}
    for department_id in primary.values():
        counts[department_id] = counts.get(department_id, 0) + 1
    if not superuser:
        departments = [d for d in departments if d['id'] in scope]
        members = [m for m in members if primary.get(str(m['id'])) in scope]
    return {
        'departments': [{'id': d['id'], 'name': d['name'], 'parent_id': d['parent_id'], 'member_count': counts.get(d['id'], 0),
                         'head_ids': sorted(head_map.get(d['id'], []))} for d in departments],
        'members': [{'id': str(m['id']), 'name': m['name'], 'email': m['email'], 'department_id': primary.get(str(m['id'])),
                     'role': 'super_admin' if str(m['id']) in supers else 'dept_head' if str(m['id']) in head_accounts else 'member',
                     'last_login_at': m.get('last_login_at')} for m in members],
        'readonly': not superuser,
    }


def organization_view(repository, tenant, principal):
    return build_org_view(repository.departments(tenant), repository.members(tenant), repository.memberships(tenant),
                          repository.heads(tenant), repository.supers(tenant), principal)
