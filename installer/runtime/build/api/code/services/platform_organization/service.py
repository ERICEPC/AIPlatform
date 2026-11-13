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
