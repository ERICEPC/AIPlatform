"""Explicit dependency boundary: authoritative identity + published snapshot resolver."""
from flask import Blueprint,request,jsonify
from sqlalchemy.exc import DBAPIError
from werkzeug.exceptions import HTTPException
from .contracts import Fault,string,validate_request
from .store import public
from . import pb_contract

def blueprint(store,authenticate,registry,resolve_snapshot,*,adapter=pb_contract,schema_version='pb.okr.v1',name='raccoon_okr_runtime',url_prefix='/v1/okr/applications'):
 bp=Blueprint(name,__name__,url_prefix=url_prefix)
 @bp.errorhandler(Fault)
 def fault(e):
  response=jsonify(error={'code':e.code});response.status_code=e.status
  if e.status==429:response.headers['Retry-After']='5'
  return response
 @bp.errorhandler(DBAPIError)
 def database_error(e):return jsonify(error={'code':'storage_unavailable_query_original_intent'}),503
 @bp.errorhandler(HTTPException)
 def http_error(e):return jsonify(error={'code':'http_'+str(e.code)}),e.code
 @bp.after_request
 def headers(response):
  response.headers['Cache-Control']='no-store';response.headers['X-Content-Type-Options']='nosniff'
  return response
 def identity(app_id):
  # Must be a server-side lookup, never a caller-selected workspace/principal.
  value=authenticate(request.headers.get('Authorization',''),app_id)
  if value['application_id']!=app_id:raise Fault('application_forbidden',403)
  return value
 @bp.post('/<app_id>/runs')
 def submit(app_id):
  who=identity(app_id)
  if request.content_length is None or request.content_length>262144:raise Fault('payload_too_large',413)
  value=pb_contract.read_json(request.get_data(cache=False))
  is_pb=isinstance(value,dict) and value.get('schema_version')==schema_version
  if is_pb:
   contract=registry.get((schema_version,value.get('task_kind')))
   if contract is None:raise Fault('contract_not_enabled',422)
   value=adapter.parse_request(value,contract,who)
  else:contract=validate_request(value,registry)
  # Resolver checks workspace, app ownership, explicit published snapshot and
  # minimal tool policy; it may not silently select the latest draft/version.
  selected=resolve_snapshot(who,value['snapshot_id'])
  if is_pb and (not isinstance(selected,dict) or selected.get('contract_manifest_hash')!=contract['manifest_hash']):
   raise Fault('snapshot_contract_not_enabled',422)
  row,created=store.submit(who,value,contract)
  return jsonify(public(row)),202 if created else 200
 @bp.get('/<app_id>/runs/by-intent/<intent_id>')
 def intent(app_id,intent_id):
  return jsonify(public(store.get(identity(app_id),intent_id=string(intent_id))))
 @bp.get('/<app_id>/runs/<run_id>')
 def get(app_id,run_id):return jsonify(public(store.get(identity(app_id),run_id=run_id)))
 @bp.post('/<app_id>/runs/<run_id>/cancel')
 def cancel(app_id,run_id):return jsonify(public(store.cancel(identity(app_id),run_id))),202
 return bp
