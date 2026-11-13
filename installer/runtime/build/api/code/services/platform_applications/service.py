"""Assemble the existing directory response without per-application queries."""


def application_list(repository, tenant_id, scope_clause, scope_params):
    applications = repository.list_visible(tenant_id, scope_clause, scope_params)
    if not applications:
        return []
    ids = [row['id'] for row in applications]
    keys_by_app = {app_id: [] for app_id in ids}
    for key in repository.active_keys(ids):
        keys_by_app[key['app_id']].append({
            name: key[name] for name in ('hint', 'expires_at', 'created_at')})
    stats_by_app = {
        row['app_id']: {name: row[name] for name in ('calls_7d', 'last_call', 'errors_7d')}
        for row in repository.recent_calls(ids)
    }
    return [application_view(row, keys_by_app[row['id']], stats_by_app.get(row['id'], {
        'calls_7d': 0, 'last_call': None, 'errors_7d': 0})) for row in applications]


def application_view(application, keys, stats):
    return {
        **application, **stats, 'keys': keys,
        'secret_hint': keys[0]['hint'] if keys else '',
        'status': 'active' if application['enabled'] and keys and application['sso']
                  and application['callback_url'] and application['capabilities']
                  else 'disabled' if not application['enabled'] else 'pending',
    }
