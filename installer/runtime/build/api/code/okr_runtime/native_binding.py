"""Immutable application/snapshot/contract binding; explicitly provisioned only."""
import hashlib,json,time
from sqlalchemy import Table,Column,String,Float,Boolean,select
from .store import metadata
from .contracts import Fault
bindings=Table('raccoon_okr_snapshot_bindings',metadata,
 Column('workspace_id',String,primary_key=True),Column('application_id',String,primary_key=True),
 Column('snapshot_id',String,primary_key=True),Column('manifest_hash',String,nullable=False),
 Column('soul_hash',String,nullable=False),Column('policy',String,nullable=False),
 Column('enabled',Boolean,nullable=False,default=True),Column('created_at',Float,nullable=False))
POLICY='okr-no-tools-v1'
def soul_hash(soul):return hashlib.sha256(json.dumps(soul,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()).hexdigest()
def safe_soul(soul):
 if not soul.get('model'):raise Fault('model_not_configured',422)
 for key,names in {'tools':('dify_tools','cli_tools'),'knowledge':('sets',),'human':('tools','contacts'),'env':('variables','secret_refs'),'memory':('artifacts',)}.items():
  if any(soul.get(key,{}).get(name) for name in names):raise Fault('okr_tool_policy_denied',422)
 if any(soul.get(key) for key in ('config_files','config_skills','app_variables')):raise Fault('okr_tool_policy_denied',422)
 if soul.get('memory',{}).get('scope'):raise Fault('okr_memory_policy_denied',422)
 # Shell and hidden config-layer tools are additionally removed at request-builder boundary.
 return soul

def native_snapshot(identity,snapshot_id,require_active=False):
 from core.db.session_factory import session_factory
 from models.agent import Agent,AgentConfigSnapshot,AgentConfigRevision
 from sqlalchemy import select
 with session_factory.create_session() as s:
  agent=s.scalar(select(Agent).where(Agent.id==identity['application_id'],Agent.tenant_id==identity['workspace_id'],Agent.status=='active'))
  snap=s.scalar(select(AgentConfigSnapshot).where(AgentConfigSnapshot.id==snapshot_id,AgentConfigSnapshot.agent_id==identity['application_id'],AgentConfigSnapshot.tenant_id==identity['workspace_id']))
  published=s.scalar(select(AgentConfigRevision.id).where(AgentConfigRevision.tenant_id==identity['workspace_id'],AgentConfigRevision.agent_id==identity['application_id'],AgentConfigRevision.current_snapshot_id==snapshot_id,AgentConfigRevision.operation=='publish_draft'))
  if agent is None or snap is None or not published:raise Fault('published_snapshot_not_found',404)
  if require_active and (not agent.active_config_is_published or str(agent.active_config_snapshot_id)!=snapshot_id):raise Fault('active_publication_required',422)
  return safe_soul(snap.config_snapshot_dict)

class Resolver:
 def __init__(self,engine,loader=native_snapshot):self.engine,self.loader=engine,loader
 def bind(self,identity,snapshot_id,manifest_hash):
  soul=self.loader(identity,snapshot_id,require_active=True);values=dict(workspace_id=identity['workspace_id'],application_id=identity['application_id'],snapshot_id=snapshot_id)
  with self.engine.begin() as c:
   old=c.execute(select(bindings).filter_by(**values)).mappings().first()
   if old:
    if old['manifest_hash']!=manifest_hash or old['soul_hash']!=soul_hash(soul) or not old['enabled']:raise Fault('binding_conflict',409)
    return
   c.execute(bindings.insert().values(**values,manifest_hash=manifest_hash,soul_hash=soul_hash(soul),policy=POLICY,enabled=True,created_at=time.time()))
 def __call__(self,identity,snapshot_id):
  with self.engine.connect() as c:row=c.execute(select(bindings).filter_by(workspace_id=identity['workspace_id'],application_id=identity['application_id'],snapshot_id=snapshot_id,enabled=True)).mappings().first()
  if not row:raise Fault('snapshot_contract_not_enabled',422)
  soul=self.loader(identity,snapshot_id)
  if row['soul_hash']!=soul_hash(soul) or row['policy']!=POLICY:raise Fault('snapshot_binding_changed',409)
  return {'contract_manifest_hash':row['manifest_hash']}
