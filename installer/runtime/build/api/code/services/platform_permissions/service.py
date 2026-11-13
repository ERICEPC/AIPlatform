"""Permission response assembly and cycle-safe descendant traversal."""


def descendant_ids(departments, seeds):
    found = set(seeds)
    children = {}
    for department in departments:
        children.setdefault(department['parent_id'], []).append(department['id'])
    pending = list(found)
    while pending:
        for child in children.get(pending.pop(), ()):
            if child not in found:
                found.add(child)
                pending.append(child)
    return sorted(found)


def expand_scope(repository, tenant, seeds):
    seeds = set(seeds)
    return descendant_ids(repository.departments(tenant), seeds)


def read_permissions(repository, tenant, user, permission_items):
    assignment = repository.assignment(tenant, user)
    if not assignment:
        return {'role': 'developer', 'permissions': [], 'department_ids': [], 'scope_ids': []}
    superuser = assignment['role_id'] == 'role-super'
    return {
        'role': 'super_admin' if superuser else 'admin',
        'permissions': list(permission_items) if superuser else assignment['permissions'],
        'department_ids': assignment['department_ids'],
        'scope_ids': expand_scope(repository, tenant, assignment['department_ids']),
        'role_id': assignment['role_id'],
    }
