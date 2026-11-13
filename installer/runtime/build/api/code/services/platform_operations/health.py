"""Lazy infrastructure adapter: Redis is only accessed for super administrators."""


def ping_cache():
    from extensions.ext_redis import redis_client
    return redis_client.ping()
