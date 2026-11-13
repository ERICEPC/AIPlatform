"""Legacy-compatible JSON value normalization for platform responses."""
from uuid import UUID

def clean(v):
    if isinstance(v,UUID):return str(v)
    if isinstance(v,dict): return {k:clean(x) for k,x in v.items()}
    if isinstance(v,list): return [clean(x) for x in v]
    return v.isoformat() if hasattr(v,'isoformat') else v
