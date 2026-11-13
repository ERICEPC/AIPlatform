"""SQL-backed admission and lifecycle. No automatic retries of claimed work."""
import time
from uuid import uuid4
from sqlalchemy import MetaData,Table,Column,String,Text,JSON,Float,Boolean,UniqueConstraint,select,update,text,func
from .contracts import Fault,digest
metadata=MetaData()
runs=Table('raccoon_okr_runs',metadata,
 Column('id',String,primary_key=True),Column('workspace_id',String,nullable=False),
 Column('principal_id',String,nullable=False),Column('application_id',String,nullable=False),
 Column('intent_id',String,nullable=False),Column('request_hash',String,nullable=False),
 Column('request',JSON),Column('contract',JSON),Column('snapshot_id',String,nullable=False),
 Column('state',String,nullable=False),Column('result',JSON),Column('error_code',String),
 Column('created_at',Float,nullable=False),Column('started_at',Float),Column('finished_at',Float),
 Column('expires_at',Float,nullable=False),Column('deadline',Float),Column('cancelled',Boolean,default=False,nullable=False),
 Column('attempts',JSON),UniqueConstraint('workspace_id','principal_id','application_id','intent_id',name='okr_intent_scope'))
TERMINAL={'succeeded','failed','timed_out','cancelled','interrupted'}

class Store:
 def __init__(self,engine,clock=time.time,retention=30*86400,max_pending=20):
  self.engine,self.clock,self.retention,self.max_pending=engine,clock,retention,max_pending
 def migrate(self):metadata.create_all(self.engine)
 def scope(self,identity):
  return (runs.c.workspace_id==identity['workspace_id']) & (runs.c.principal_id==identity['principal_id']) & (runs.c.application_id==identity['application_id'])
 def _admission_lock(self,c,identity):
  if c.dialect.name=='postgresql':
   c.execute(text("SET LOCAL lock_timeout='5s'"))
   c.execute(text('SELECT pg_advisory_xact_lock(hashtext(:scope))'),{'scope':'okr:'+identity['workspace_id']})
  elif c.dialect.name=='sqlite':c.exec_driver_sql('BEGIN IMMEDIATE')
  else:raise RuntimeError('unsupported database')
 def submit(self,identity,request,contract):
  now=self.clock()
  with self.engine.begin() as c:
   self._admission_lock(c,identity)
   old=c.execute(select(runs).where(self.scope(identity),runs.c.intent_id==request['intent_id'])).mappings().first()
   fingerprint=digest(request)
   if old:
    if old['expires_at']<=now:raise Fault('intent_expired',410)
    if old['request_hash']!=fingerprint:raise Fault('intent_conflict',409)
    return dict(old),False
   pending=c.scalar(select(func.count()).select_from(runs).where(runs.c.workspace_id==identity['workspace_id'],runs.c.state.in_(['queued','running'])))
   if pending>=self.max_pending:raise Fault('queue_full',429)
   row=dict(id=str(uuid4()),**{k:identity[k] for k in ('workspace_id','principal_id','application_id')},
    intent_id=request['intent_id'],request_hash=fingerprint,request=request,contract=contract,
    snapshot_id=request['snapshot_id'],state='queued',created_at=now,expires_at=now+self.retention,cancelled=False,
    result=None,error_code=None,started_at=None,finished_at=None,deadline=None,attempts=[])
   c.execute(runs.insert().values(**row));return row,True
 def get(self,identity,run_id=None,intent_id=None):
  with self.engine.connect() as c:
   selector=runs.c.id==run_id if run_id is not None else runs.c.intent_id==intent_id
   row=c.execute(select(runs).where(self.scope(identity),selector)).mappings().first()
   if row is None:raise Fault('run_not_found',404)
   if row['expires_at']<=self.clock():raise Fault('run_expired',410)
   pb=(row.get('request') or {}).get('pb_request')
   if pb and pb['scope']!=identity.get('pb_scope'):raise Fault('pb_scope_forbidden',403)
   return dict(row)
 def cancel(self,identity,run_id):
  self.get(identity,run_id=run_id)
  with self.engine.begin() as c:
   # Atomically finish queued work; signal running work. Result commits check flag.
   c.execute(update(runs).where(self.scope(identity),runs.c.id==run_id,runs.c.state=='queued').values(state='cancelled',cancelled=True,finished_at=self.clock()))
   c.execute(update(runs).where(self.scope(identity),runs.c.id==run_id,runs.c.state=='running').values(cancelled=True))
  return self.get(identity,run_id=run_id)
 def claim(self,timeout=120):
  now=self.clock()
  with self.engine.begin() as c:
   if c.dialect.name=='sqlite':c.exec_driver_sql('BEGIN IMMEDIATE')
   c.execute(update(runs).where(runs.c.state=='queued',runs.c.created_at<=now-300).values(state='timed_out',error_code='queue_timeout',finished_at=now))
   row=c.execute(select(runs).where(runs.c.state=='queued',runs.c.cancelled==False).order_by(runs.c.created_at).with_for_update(skip_locked=True).limit(1)).mappings().first()
   if not row:return None
   c.execute(update(runs).where(runs.c.id==row['id']).values(state='running',started_at=now,deadline=now+timeout))
   return dict(row,state='running',started_at=now,deadline=now+timeout)
 def stopped(self,run_id):
  with self.engine.connect() as c:
   r=c.execute(select(runs).where(runs.c.id==run_id)).mappings().one()
   return r['state']!='running' or r['cancelled'] or self.clock()>=r['deadline']
 def finish(self,run_id,state,result=None,error=None,attempts=None):
  assert state in TERMINAL
  now=self.clock()
  with self.engine.begin() as c:
   row=c.execute(select(runs).where(runs.c.id==run_id).with_for_update()).mappings().one()
   if row['state']!='running':return
   if row['cancelled']:state,result,error='cancelled',None,'cancelled'
   elif now>=row['deadline']:state,result,error='timed_out',None,'execution_timeout'
   c.execute(update(runs).where(runs.c.id==run_id).values(state=state,result=result,error_code=error,attempts=attempts or [],finished_at=now))
 def recover(self):
  # Only the single lease-owning worker may recover after restart.
  with self.engine.begin() as c:
   interrupted=list(c.scalars(select(runs.c.id).where(runs.c.state=='running').with_for_update()))
   c.execute(update(runs).where(runs.c.state=='running').values(state='interrupted',error_code='worker_restarted',finished_at=self.clock()))
   return interrupted
 def expire_payloads(self):
  # Keep minimal intent tombstones: an expired intent never starts a second run.
  with self.engine.begin() as c:
   c.execute(update(runs).where(runs.c.expires_at<=self.clock(),runs.c.state.in_(TERMINAL)).values(request=None,contract=None,result=None,attempts=None))

def public(row):
 if row.get('contract',{}).get('adapter')=='pb.recommendation.v1':
  from .recommendation_contract import response
  return response(row)
 if (row.get('request') or {}).get('pb_request'):
  from .pb_contract import response
  return response(row)
 return {k:row.get(k) for k in ('id','intent_id','snapshot_id','state','result','error_code','created_at','started_at','finished_at','expires_at','cancelled','attempts')} | {'input_snapshot_hash':(row.get('request') or {}).get('input_snapshot_hash'),'usage_completeness':'unknown' if not row.get('attempts') else 'partial'}
