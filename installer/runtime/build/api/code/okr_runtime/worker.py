"""Executor must implement snapshot-pinned execution, stop, and safe diagnostics.
Native adapter preserves incomplete model-attempt telemetry and uses bounded cancellation.
"""
import json
import multiprocessing
import time
from .contracts import Fault,validate_result

# Only structured, nonsecret provider facts may cross back from an executor.
def attempt_facts(values):
 if not isinstance(values,list):return []
 result=[]
 for v in values:
  if not isinstance(v,dict):continue
  item={k:v[k] for k in ('attempt_id','model','provider','state','input_tokens','output_tokens','usage_completeness','native_run_id') if k in v}
  for name in ('input_tokens','output_tokens'):
   if type(item.get(name)) is not int or item[name]<0:item[name]=None
  if item.get('usage_completeness') not in ('complete','partial','unknown'):item['usage_completeness']='unknown'
  result.append(item)
 return result

def child(executor,job,pipe):
 try:
  # Executor receives the frozen schema/input/snapshot, not a mutable app draft.
  answer,attempts=executor.execute(job)
  pipe.send(('ok',answer,attempt_facts(attempts)))
 except BaseException as exc:
  pipe.send(('error',exc.code if isinstance(exc,Fault) else 'native_'+type(exc).__name__,[]))
 finally:pipe.close()

def stop_child(executor,run_id):
 try:executor.stop(run_id)
 except Exception:pass # Stop uncertainty must not revive a terminal run.

def cancel_prepared(descriptor,pipe):
 # Lightweight transport process: no Flask/model imports before cancellation.
 import urllib.request,urllib.error
 from urllib.parse import quote
 try:
  headers={'Content-Type':'application/json'}
  if descriptor.get('api_token'):headers['Authorization']='Bearer '+descriptor['api_token'].strip()
  req=urllib.request.Request(descriptor['base_url'].rstrip('/')+'/runs/'+quote(descriptor['backend_run_id'],safe='')+'/cancel',data=b'{}',headers=headers,method='POST')
  with urllib.request.urlopen(req,timeout=5) as response:
   pipe.send('accepted' if 200<=response.status<300 else 'unknown')
 except urllib.error.HTTPError as exc:pipe.send('already_terminal_or_conflict' if exc.code==409 else 'rejected_'+str(exc.code))
 except Exception:pipe.send('unknown')
 finally:pipe.close()

def bounded_stop(executor,run_id):
 ctx=multiprocessing.get_context('spawn');receiver=None
 if hasattr(executor,'prepare_stop'):
  descriptor=executor.prepare_stop(run_id)
  if not descriptor:return
  receiver,sender=ctx.Pipe(duplex=False)
  stop=ctx.Process(target=cancel_prepared,args=(descriptor,sender));stop.start();sender.close()
 else:
  stop=ctx.Process(target=stop_child,args=(executor,run_id));stop.start()
 stop.join(timeout=15)
 if stop.is_alive():stop.terminate();stop.join(timeout=2)
 if stop.is_alive():stop.kill();stop.join(timeout=2)
 if receiver:
  try:status=receiver.recv() if receiver.poll() else 'unknown'
  except EOFError:status='unknown'
  receiver.close();executor.record_stop(run_id,status)

class Worker:
 def __init__(self,store,executor,principal_active,poll=.1):
  self.store,self.executor,self.principal_active,self.poll=store,executor,principal_active,poll
 def execute(self,job):
  if not self.principal_active(job):
   self.store.finish(job['id'],'failed',error='principal_revoked');return
  # Spawn isolates wall-clock enforcement from a stuck model stream or tool call.
  ctx=multiprocessing.get_context('spawn');receiver,sender=ctx.Pipe(duplex=False)
  process=ctx.Process(target=child,args=(self.executor,job,sender));process.start();sender.close()
  attempts=[];native_completed=False
  try:
   while True:
    if not self.principal_active(job):raise Fault('principal_revoked',403)
    if self.store.stopped(job['id']):raise Fault('execution_stopped')
    if receiver.poll(self.poll):
     status,value,attempts=receiver.recv()
     if status!='ok':raise Fault(value or 'execution_failed')
     native_completed=True
     if isinstance(value,str):
      from .pb_contract import read_json
      value=read_json(value.encode('utf-8'))
     if job['contract'].get('adapter')=='pb.recommendation.v1':
      from .recommendation_contract import check_output
      result=check_output(value,job['contract'],job['request']['pb_request'])
     elif job['contract'].get('adapter')=='pb.okr.v1':
      from .pb_contract import check_output
      result=check_output(value,job['contract'],job['request']['pb_request'])
     else:result=validate_result(value,job['contract'],job['request']['input'])
     self.store.finish(job['id'],'succeeded',result=result,attempts=attempts);return
    if not process.is_alive():raise Fault('executor_interrupted')
  except (Fault,EOFError) as exc:
   self.store.finish(job['id'],'failed',error=exc.code if isinstance(exc,Fault) else 'executor_interrupted',attempts=attempts)
  finally:
   if process.is_alive():process.terminate()
   process.join(timeout=2)
   if process.is_alive():process.kill();process.join(timeout=2)
   receiver.close()
   # Adapter stop must be bounded/nonblocking and use a persisted native task id.
   if not native_completed:
    bounded_stop(self.executor,job['id'])
 def serve(self,shutdown):
  if self.store.engine.dialect.name!='postgresql':raise RuntimeError('production requires PostgreSQL')
  from sqlalchemy import text
  with self.store.engine.connect() as lease:
   if not lease.scalar(text('SELECT pg_try_advisory_lock(732410280)')):raise RuntimeError('worker already running')
   lease.commit()
   for run_id in self.store.recover():bounded_stop(self.executor,run_id)
   try:
    while not shutdown.is_set():
     lease.execute(text('SELECT 1'));lease.commit()
     self.store.expire_payloads()
     job=self.store.claim()
     if job:self.execute(job)
     else:shutdown.wait(.5)
   finally:
    lease.execute(text('SELECT pg_advisory_unlock(732410280)'));lease.commit()
