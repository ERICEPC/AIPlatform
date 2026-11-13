"""Versioned envelope; business schemas are supplied by the integration owner."""
import hashlib
import json
import math
from jsonschema import Draft202012Validator

KINDS = {'plan.decompose', 'task.suggest', 'progress.review'}
class Fault(Exception):
    def __init__(self, code, status=400):
        self.code, self.status = code, status
        super().__init__(code)

def canonical(value):
    # rx-json-v1 deliberately excludes floats to avoid cross-language ambiguity.
    # Decimal business values must be strings. IDs and strings are not normalized.
    def check(v):
        if v is None or isinstance(v, (str, bool)): return
        if type(v) is int and abs(v) <= 9007199254740991: return
        if isinstance(v, list):
            for item in v: check(item)
            return
        if isinstance(v, dict) and all(isinstance(k,str) for k in v):
            for item in v.values(): check(item)
            return
        raise Fault('noncanonical_json')
    check(value)
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')
    except (ValueError, UnicodeError): raise Fault('noncanonical_json') from None

def digest(value): return hashlib.sha256(canonical(value)).hexdigest()
def string(value, limit=200):
    if not isinstance(value,str) or not value.strip() or len(value)>limit: raise Fault('invalid_string')
    return value

def validate_request(value, registry):
    fields={'intent_id','task_kind','snapshot_id','contract_version','input_snapshot_hash','input'}
    if not isinstance(value,dict) or set(value)!=fields: raise Fault('invalid_envelope')
    for key in fields-{'input'}: string(value[key])
    if value['task_kind'] not in KINDS: raise Fault('unsupported_task_kind')
    if not isinstance(value['input'],dict): raise Fault('invalid_input')
    if len(canonical(value))>262144: raise Fault('payload_too_large',413)
    if value['input_snapshot_hash']!=digest(value['input']): raise Fault('input_hash_mismatch')
    contract=registry.get((value['contract_version'],value['task_kind']))
    if contract is None: raise Fault('contract_not_enabled',422)
    if list(Draft202012Validator(contract['input_schema']).iter_errors(value['input'])):
        raise Fault('input_schema_invalid',422)
    return contract

def validate_result(value, contract, frozen_input):
    if not isinstance(value,dict): raise Fault('output_schema_invalid',422)
    if list(Draft202012Validator(contract['output_schema']).iter_errors(value)):
        raise Fault('output_schema_invalid',422)
    # References are explicitly configured by the contract, never guessed from text.
    def at(obj,path):
        for key in path: obj=obj[key]
        return obj
    try:
        for rule in contract.get('reference_rules',[]):
            allowed=set(at(frozen_input,rule['allowed_path']))
            used=at(value,rule['result_path'])
            if not isinstance(used,list) or any(x not in allowed for x in used):
                raise Fault('output_reference_invalid',422)
        for rule in contract.get('equality_rules',[]):
            if at(value,rule['result_path'])!=at(frozen_input,rule['input_path']):
                raise Fault('output_parent_version_invalid',422)
    except (KeyError,TypeError): raise Fault('output_contract_path_invalid',422) from None
    if value.get('result_kind') not in ('candidate','missing_inputs'): raise Fault('output_result_kind_invalid',422)
    return value
