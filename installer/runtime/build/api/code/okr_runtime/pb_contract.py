"""PB 5d3e303 contract adapter; no PB authorization lookup or business writes."""
import calendar
import hashlib
import json
from collections import defaultdict
from datetime import date
from pathlib import Path
from jsonschema import Draft202012Validator
from .contracts import Fault,canonical,digest

COMMIT='5d3e303e038b393b618ef0ecd628ee7c4421115d'
REVISION='2026-10-28.no-action'
ROOT=Path(__file__).resolve().parents[1]/'vendor'/'pb-5d3e303'
MANIFEST_SHA='946e2e369dda5dcb186d51dd050d0d3e650a45ec795f694039cf8ccc83b7d762'

def load_contract():
 if hashlib.sha256((ROOT/'manifest.json').read_bytes()).hexdigest()!=MANIFEST_SHA:raise RuntimeError('PB manifest checksum mismatch')
 manifest=json.loads((ROOT/'manifest.json').read_text())
 for name,expected in manifest['files'].items():
  if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=expected:raise RuntimeError('PB contract checksum mismatch: '+name)
 schemas={name:json.loads((ROOT/(name+'.schema.json')).read_text()) for name in ('request','model-output','runtime-receipt')}
 for schema in schemas.values():Draft202012Validator.check_schema(schema)
 return dict(adapter='pb.okr.v1',commit=COMMIT,revision=REVISION,manifest_hash=hashlib.sha256((ROOT/'manifest.json').read_bytes()).hexdigest(),schemas=schemas)

def schema_check(value,schema,code):
 if list(Draft202012Validator(schema).iter_errors(value)):raise Fault(code,422)
 # jsonschema treats 1.0 as integer; PB explicitly forbids floats and bool-as-int.
 def walk(v):
  if isinstance(v,float):raise Fault(code,422)
  if isinstance(v,dict):
   for x in v.values():walk(x)
  elif isinstance(v,list):
   for x in v:walk(x)
 walk(value)

def read_json(raw):
 if len(raw)>262144:raise Fault('payload_too_large',413)
 def pairs(values):
  obj={}
  for key,value in values:
   if key in obj:raise ValueError('duplicate key')
   obj[key]=value
  return obj
 def invalid(_):raise ValueError('nonfinite number')
 try:return json.loads(raw.decode('utf-8'),object_pairs_hook=pairs,parse_constant=invalid)
 except (ValueError,UnicodeError,RecursionError):raise Fault('json_invalid') from None

def input_hash(value):return digest({k:value[k] for k in ('schema_version','task_kind','scope','application','input')})

def exact_window(w):
 try:
  start,end=date.fromisoformat(w['starts_on']),date.fromisoformat(w['ends_on']);level=w['level']
  if level=='day':expected=(start,start,start.isoformat())
  elif level=='week':
   y,n,_=start.isocalendar();expected=(date.fromisocalendar(y,n,1),date.fromisocalendar(y,n,7),f'{y:04d}-W{n:02d}')
  elif level=='month':expected=(start.replace(day=1),start.replace(day=calendar.monthrange(start.year,start.month)[1]),f'{start.year:04d}-{start.month:02d}')
  else:
   m=(start.month-1)//3*3+1;expected=(date(start.year,m,1),date(start.year,m+2,calendar.monthrange(start.year,m+2)[1]),f'{start.year:04d}Q{(m-1)//3+1}')
  if (start,end,w['period_key'])!=expected:raise ValueError()
 except (ValueError,TypeError):raise Fault('invalid_period',422) from None

def parse_request(value,contract,identity):
 schema_check(value,contract['schemas']['request'],'request_schema_invalid')
 # PB labels become a permitted scope only via pre-provisioned server policy.
 if value['application']['workspace_id']!=identity['workspace_id'] or value['application']['application_id']!=identity['application_id']:
  raise Fault('application_forbidden',403)
 if not identity.get('pb_scope') or value['scope']!=identity['pb_scope']:raise Fault('pb_scope_forbidden',403)
 if value['input_snapshot_hash']!=input_hash(value):raise Fault('input_hash_mismatch')
 s=value['input'];refs=[x['ref'] for x in s['sources']]
 if s['parent_confirmed'] is not True:raise Fault('parent_confirmation_required',422)
 if s['cycle_ref']['kind']!='cycle' or s['kr_ref']['kind']!='kr':raise Fault('invalid_baseline_ref',422)
 if len({(r['kind'],r['id']) for r in refs})!=len(refs):raise Fault('duplicate_source',422)
 if any(s[k] not in refs for k in ('cycle_ref','kr_ref','parent_ref')):raise Fault('missing_exact_source',422)
 for key in ('members','projects'):
  if len({x['id'] for x in s[key]})!=len(s[key]):raise Fault('duplicate_'+key,422)
 if any(p['kr_id']!=s['kr_ref']['id'] for p in s['projects']):raise Fault('project_kr_mismatch',422)
 parent,target=s['parent_window'],s['target_window'];exact_window(parent);exact_window(target)
 if s['parent_ref']['kind']=='cycle' and s['parent_ref']!=s['cycle_ref']:raise Fault('wrong_cycle_parent',422)
 allowed={'plan.decompose':{('quarter','month','cycle'),('month','week','month')},'task.suggest':{('week','day','week')},'progress.review':{('quarter','month','cycle'),('month','week','month'),('week','week','week'),('month','month','month')}}
 if (parent['level'],target['level'],s['parent_ref']['kind']) not in allowed[value['task_kind']]:raise Fault('invalid_granularity',422)
 if not parent['starts_on']<=target['starts_on']<=parent['ends_on'] or (target['level']!='week' and target['ends_on']>parent['ends_on']):raise Fault('target_outside_parent',422)
 return dict(intent_id=value['intent_id'],task_kind=value['task_kind'],snapshot_id=value['application']['snapshot_id'],contract_version='pb.okr.v1',input_snapshot_hash=value['input_snapshot_hash'],input=s,pb_request=value)

def check_output(value,contract,request):
 schema_check(value,contract['schemas']['model-output'],'output_schema_invalid')
 r=value['result'];s=request['input']
 if r['task_kind']!=request['task_kind']:raise Fault('task_kind_mismatch',422)
 allowed={canonical(x['ref']) for x in s['sources']}
 def refs(values):
  if any(canonical(ref) not in allowed for ref in values):raise Fault('source_reference_denied',422)
 kind=r['result_kind']
 if kind=='missing_inputs':
  for item in r['missing_inputs']:refs(item['source_refs'])
 elif kind=='no_action':
  refs(r['source_refs'])
  if r['parent_ref']!=s['parent_ref']:raise Fault('parent_changed',422)
  if r['parent_ref'] not in r['source_refs']:raise Fault('parent_reference_required',422)
 elif r['task_kind']=='progress.review':
  for key in ('observed_facts','gaps','risks','adjustment_suggestions'):
   for item in r[key]:refs(item['source_refs'])
 else:
  candidates=[r['candidate']] if r['task_kind']=='plan.decompose' else r['candidates']
  if len({x['candidate_id'] for x in candidates})!=len(candidates):raise Fault('duplicate_candidate',422)
  members={x['id']:x for x in s['members']};projects={x['id'] for x in s['projects']};effort=defaultdict(int)
  for item in candidates:
   refs(item['source_refs'])
   if item['parent_ref']!=s['parent_ref']:raise Fault('parent_changed',422)
   owner=members.get(item['owner_id'])
   if owner is None or not owner['can_own']:raise Fault('owner_denied',422)
   if r['task_kind']=='task.suggest':
    verifier=members.get(item['verifier_id'])
    if verifier is None or not verifier['can_verify'] or verifier['id']==owner['id']:raise Fault('verifier_denied',422)
    if item['project_id'] not in projects:raise Fault('project_denied',422)
    try:work,due=date.fromisoformat(item['work_date']),date.fromisoformat(item['due_date'])
    except ValueError:raise Fault('task_date_invalid',422) from None
    if not s['target_window']['starts_on']<=work.isoformat()<=s['target_window']['ends_on'] or work>due or due.isoformat()>s['parent_window']['ends_on']:raise Fault('task_date_invalid',422)
    effort[owner['id']]+=item['plan_minutes']
    if owner['available_minutes'] is None or effort[owner['id']]>owner['available_minutes']:raise Fault('capacity_unavailable',422)
 return value

def receipt(row):
 request=row['request']['pb_request']
 # No attempt invented from an overall successful run. Missing facts stay unknown.
 attempts=[]
 for a in row.get('attempts') or []:
  if not a.get('attempt_id') or a.get('state') not in ('succeeded','failed','unknown'):continue
  counts=[a.get('input_tokens'),a.get('output_tokens')]
  completeness='unknown' if all(x is None for x in counts) else 'partial'
  if a.get('usage_completeness')=='complete' and all(x is not None for x in counts):completeness='complete'
  attempts.append(dict(id=a['attempt_id'],model=a.get('model'),state=a['state'],usage=dict(completeness=completeness,input_tokens=counts[0],output_tokens=counts[1])))
 result={k:request[k] for k in ('schema_version','intent_id','task_kind','input_snapshot_hash','scope','application')}
 result.update(run_id=row['id'],state=row['state'],attempts_complete=False,attempts=attempts)
 schema_check(result,row['contract']['schemas']['runtime-receipt'],'internal_receipt_invalid')
 return result

def response(row):
 return dict(receipt=receipt(row),model_output=row.get('result'),runtime=dict(error_code=row.get('error_code'),cancel_requested=row['cancelled'],created_at=row['created_at'],started_at=row.get('started_at'),finished_at=row.get('finished_at'),expires_at=row['expires_at'],contract_manifest_hash=row['contract']['manifest_hash']))
