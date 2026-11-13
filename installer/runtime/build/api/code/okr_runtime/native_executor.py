"""Native ordinary Agent adapter; no global monkeypatches or team orchestration."""
import hashlib,json,time
from sqlalchemy import Table,Column,String,Float,JSON,select,update
from .store import metadata,Store,runs
from .contracts import Fault
from .native_binding import Resolver
traces=Table('raccoon_okr_native_traces',metadata,
 Column('run_id',String,primary_key=True),Column('task_id',String,nullable=False),
 Column('user_id',String,nullable=False),Column('message_id',String,nullable=False),
 Column('conversation_id',String,nullable=False),Column('snapshot_id',String,nullable=False),
 Column('created_at',Float,nullable=False),Column('telemetry',JSON))

def native_engine():
 from core.db.session_factory import session_factory
 with session_factory.create_session() as s:return s.bind

def restricted_builder():
 from clients.agent_backend import AgentBackendRunRequestBuilder
 class Restricted(AgentBackendRunRequestBuilder):
  def build_for_agent_app(self,run_input):
   constrained=run_input.model_copy(update=dict(include_shell=False,shell_config=None,config_layer_config=None,tools=None,core_tools=None,knowledge=None,ask_human_config=None,include_history=False,session_snapshot=None,deferred_tool_results=None))
   return super().build_for_agent_app(constrained)
 return Restricted()

class NativeExecutor:
 def execute(self,job):
  from app import app
  from core.app.apps.agent_app.app_generator import AgentAppGenerator
  from core.app.entities.app_invoke_entities import InvokeFrom
  from core.db.session_factory import session_factory
  from models.agent import Agent,AgentConfigSnapshot
  from models.agent_config_entities import AgentSoulConfig
  from models.model import App
  from services.end_user_service import EndUserService
  from channel_hub.runtime import Answer
  from .auth import Authenticator
  from .native_checks import membership_check
  tid,aid,sid=job['workspace_id'],job['application_id'],job['snapshot_id']
  with app.app_context(),app.test_request_context('/internal/okr-run',method='POST'):
   engine=native_engine();store=Store(engine);resolver=Resolver(engine)
   def check():
    if store.stopped(job['id']):raise Fault('execution_stopped')
    if not Authenticator(engine,membership_check).principal_active(job):raise Fault('principal_revoked',403)
    if resolver(job,sid)['contract_manifest_hash']!=job['contract']['manifest_hash']:raise Fault('snapshot_binding_changed',409)
   class Pinned(AgentAppGenerator):
    @staticmethod
    def _build_runner():
     from core.app.apps.agent_app.runtime_request_builder import AgentAppRuntimeRequestBuilder
     runner=AgentAppGenerator._build_runner();runner._request_builder=AgentAppRuntimeRequestBuilder(request_builder=restricted_builder());return runner
    def _selected(self,session):
     check()
     agent=session.scalar(select(Agent).where(Agent.id==aid,Agent.tenant_id==tid,Agent.status=='active'))
     snap=session.scalar(select(AgentConfigSnapshot).where(AgentConfigSnapshot.id==sid,AgentConfigSnapshot.agent_id==aid,AgentConfigSnapshot.tenant_id==tid))
     if agent is None or snap is None:raise Fault('published_snapshot_not_found',404)
     return agent,snap,AgentSoulConfig.model_validate(snap.config_snapshot_dict)
    def _resolve_agent(self,app_model,*,session,**kwargs):
     agent,snap,soul=self._selected(session)
     if str(agent.backing_app_id or agent.app_id)!=str(app_model.id):raise Fault('application_forbidden',403)
     return agent,str(snap.id),'snapshot',soul
    def _resolve_agent_by_id(self,*,tenant_id,agent_id,snapshot_id,session):
     if (str(tenant_id),str(agent_id),str(snapshot_id))!=(tid,aid,sid):raise Fault('snapshot_binding_changed',409)
     return self._selected(session)
    def _init_generate_records(self,entity,conversation,*,session):
     check();conversation,message=super()._init_generate_records(entity,conversation,session=session)
     # This hook runs before the native model worker starts: cancellation IDs are
     # persisted even if the first SSE message never reaches the caller.
     with engine.begin() as c:
      c.execute(traces.insert().values(run_id=job['id'],task_id=str(entity.task_id),user_id=str(entity.user_id),message_id=str(message.id),conversation_id=str(conversation.id),snapshot_id=sid,created_at=time.time()))
     check();return conversation,message
   check()
   with session_factory.create_session() as session:
    agent=session.scalar(select(Agent).where(Agent.id==aid,Agent.tenant_id==tid,Agent.status=='active'))
    if agent is None:raise Fault('application_forbidden',403)
    model=session.get(App,agent.backing_app_id or agent.app_id)
    if model is None or str(model.tenant_id)!=tid:raise Fault('application_forbidden',403)
    user=EndUserService.get_or_create_end_user(model,'okr:'+hashlib.sha256((job['principal_id']+':'+job['id']).encode()).hexdigest())
    stream=Pinned().generate(app_model=model,user=user,args={'query':json.dumps(job['request']['pb_request'],ensure_ascii=False),'inputs':{},'response_mode':'streaming','auto_generate_name':False},invoke_from=InvokeFrom.SERVICE_API,session=session,streaming=True)
    answer=Answer()
    for event in stream:
     check()
     if isinstance(event,str):
      for line in event.splitlines():
       if line.startswith('data:'):
        try:event=json.loads(line[5:].strip())
        except ValueError:continue
        break
     if not isinstance(event,dict):continue
     if event.get('event')=='message_started' and event.get('snapshot_id')!=sid:raise Fault('snapshot_binding_changed',409)
     answer.accept(event)
     # Native SSE usage is aggregate, not evidence of every fallback attempt.
     if event.get('event')=='message_end':
      usage=(event.get('metadata') or {}).get('usage') or {}
      observed={k:usage[k] for k in ('prompt_tokens','completion_tokens','total_tokens') if type(usage.get(k)) is int and usage[k]>=0}
      with engine.begin() as c:c.execute(update(traces).where(traces.c.run_id==job['id']).values(telemetry={'aggregate_usage':observed,'attempts_complete':False}))
    return answer.result()[0],[]
 def prepare_stop(self,run_id):
  from app import app
  from core.app.apps.base_app_queue_manager import AppQueueManager
  from core.app.entities.app_invoke_entities import InvokeFrom
  from configs import dify_config
  from core.db.session_factory import session_factory
  from models.model import Message
  from models.agent import Agent
  with app.app_context():
   engine=native_engine()
   with engine.connect() as c:
    trace=c.execute(select(traces).where(traces.c.run_id==run_id)).mappings().first()
    job=c.execute(select(runs).where(runs.c.id==run_id)).mappings().first()
   if not trace or not job:return
   AppQueueManager.set_stop_flag(trace['task_id'],InvokeFrom.SERVICE_API,trace['user_id'])
   # The adapter process may already have exited. Cancel the durable backend run
   # directly as well: a Redis flag alone needs a live native stream consumer.
   with session_factory.create_session() as session:
    agent=session.scalar(select(Agent).where(Agent.id==job['application_id'],Agent.tenant_id==job['workspace_id']))
    message=session.get(Message,trace['message_id'])
    if agent is None or message is None or str(message.app_id)!=str(agent.backing_app_id or agent.app_id) or str(message.conversation_id)!=trace['conversation_id']:
     raise Fault('native_trace_scope_mismatch',403)
    execution=json.loads(message.message_metadata or '{}').get('agent_execution') or {}
   backend_id=execution.get('backend_run_id')
   if not backend_id:return
   telemetry=dict(trace['telemetry'] or {});telemetry.update(backend_run_id=backend_id,cancel_delivery='requested')
   with engine.begin() as c:c.execute(update(traces).where(traces.c.run_id==run_id).values(telemetry=telemetry))
   return {'base_url':dify_config.AGENT_BACKEND_BASE_URL,'api_token':dify_config.AGENT_BACKEND_API_TOKEN,'backend_run_id':backend_id}
 def record_stop(self,run_id,status):
  engine=native_engine()
  with engine.begin() as c:
   row=c.execute(select(traces).where(traces.c.run_id==run_id).with_for_update()).mappings().one()
   telemetry=dict(row['telemetry'] or {});telemetry['cancel_delivery']=status
   c.execute(update(traces).where(traces.c.run_id==run_id).values(telemetry=telemetry))
