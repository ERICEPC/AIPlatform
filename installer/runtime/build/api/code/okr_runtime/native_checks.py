"""Native read-only checks. No app creation, publishing, key issuance, or registration."""
from sqlalchemy import select,text
from .contracts import Fault

def membership_check(account_id,workspace_id):
 from core.db.session_factory import session_factory
 with session_factory.create_session() as session:
  return bool(session.execute(text("""SELECT 1 FROM tenant_account_joins m JOIN accounts a ON a.id=m.account_id
   WHERE CAST(m.tenant_id AS text)=:workspace AND CAST(m.account_id AS text)=:account
   AND a.status='active' AND m.role IN ('owner','admin','editor')"""),dict(workspace=workspace_id,account=account_id)).first())

def resolve_snapshot(identity,snapshot_id):
 from core.db.session_factory import session_factory
 from models.agent import Agent,AgentConfigSnapshot
 from models.agent_config_entities import AgentSoulConfig
 with session_factory.create_session() as session:
  agent=session.scalar(select(Agent).where(Agent.id==identity['application_id'],Agent.tenant_id==identity['workspace_id'],Agent.status=='active'))
  snap=session.scalar(select(AgentConfigSnapshot).where(AgentConfigSnapshot.id==snapshot_id,AgentConfigSnapshot.agent_id==identity['application_id'],AgentConfigSnapshot.tenant_id==identity['workspace_id']))
  if agent is None or snap is None:raise Fault('snapshot_not_found',404)
  # Snapshot table semantics require native integration acceptance before activation.
  # No implicit fallback to a latest or draft configuration.
  return AgentSoulConfig.model_validate(snap.config_snapshot_dict)
