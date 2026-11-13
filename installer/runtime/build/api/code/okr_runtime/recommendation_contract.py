"""Independent draft-KR recommendation contract; never adopts a formal plan."""
import hashlib
import json
import math
from datetime import date
from pathlib import Path

from jsonschema import Draft202012Validator

from .contracts import Fault
from .pb_contract import read_json

VERSION = 'pb.recommendation.v1'
KIND = 'recommendation.generate'
ROOT = Path(__file__).resolve().parents[1] / 'vendor' / 'pb-recommendation-v1'
MANIFEST_SHA = 'bd0af54c19fcc440dd31147e7af622d8efa694e2624afabf23fd237ba858fea5'


def load_contract():
    if hashlib.sha256((ROOT / 'manifest.json').read_bytes()).hexdigest() != MANIFEST_SHA:
        raise RuntimeError('Recommendation manifest checksum mismatch')
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    for name, expected in manifest['files'].items():
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != expected:
            raise RuntimeError('Recommendation contract checksum mismatch')
    schemas = {name: json.loads((ROOT / (name + '.schema.json')).read_text())
               for name in ('request', 'model-output')}
    for schema in schemas.values():
        Draft202012Validator.check_schema(schema)
    return dict(adapter=VERSION, manifest_hash=MANIFEST_SHA, schemas=schemas)


def source_hash(source):
    # Matches PB daily_review.integrity.digest. source_json carries the exact
    # canonical UTF-8 text, avoiding float conversion in the outer rx-json-v1.
    return hashlib.sha256(json.dumps(source, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def fail(code='recommendation_source_invalid', status=422):
    raise Fault(code, status)


def source_of(value):
    raw = value.get('source_json')
    if not isinstance(raw, str) or len(raw) > 48000:
        fail('recommendation_source_too_large', 413)
    source = read_json(raw.encode('utf-8'))
    try:
        if raw != json.dumps(source, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False):
            fail('recommendation_source_not_canonical')
        if source_hash(source) != value['input_snapshot_hash']:
            fail('input_hash_mismatch', 400)
    except (TypeError, ValueError, RecursionError):
        fail()
    return source


def validate_source(source, scope):
    required = {'format', 'tenantId', 'teamId', 'projectId', 'asOfDate', 'evidence',
                'limitations', 'plan_date', 'assignees', 'okr_source'}
    if not isinstance(source, dict) or set(source) != required:
        fail()
    if source['format'] != 'recommendation-okr-evidence-v1':
        fail('recommendation_format_not_enabled')
    if (source['tenantId'], source['teamId']) != (scope['tenant_id'], scope['team_id']):
        fail('pb_scope_forbidden', 403)
    try:
        if date.fromisoformat(source['plan_date']).isoformat() != source['plan_date'] or source['asOfDate'] != source['plan_date']:
            fail()
    except (TypeError, ValueError):
        fail()
    if not isinstance(source['limitations'], list) or not source['limitations'] or any(not isinstance(x, str) for x in source['limitations']):
        fail()
    members = source['assignees']
    if not isinstance(members, list) or not 1 <= len(members) <= 20:
        fail()
    if any(not isinstance(x, dict) or set(x) != {'actor_id', 'role'}
           or not isinstance(x['actor_id'], str) or not x['actor_id']
           or x['role'] not in {'leader', 'fde'} for x in members):
        fail()
    if len({x['actor_id'] for x in members}) != len(members):
        fail('duplicate_assignees')
    evidence = source['evidence']
    if not isinstance(evidence, list) or not 1 <= len(evidence) <= 300:
        fail()
    if any(not isinstance(x, dict) or set(x) != {'ref', 'kind', 'value'}
           or not isinstance(x['ref'], str) or not 1 <= len(x['ref']) <= 128
           or not isinstance(x['kind'], str) or not isinstance(x['value'], dict) for x in evidence):
        fail()
    if len({x['ref'] for x in evidence}) != len(evidence):
        fail('duplicate_source')
    kr = source['okr_source']
    if not isinstance(kr, dict) or kr.get('cycle_status') not in {'draft', 'active'} or not kr.get('kr_id'):
        fail('invalid_kr_source')
    selected = [x for x in evidence if x['kind'] == 'selected_quarter_kr']
    if len(selected) != 1 or selected[0]['ref'] != 'okr:' + kr['kr_id'] or selected[0]['value'] != kr:
        fail('selected_kr_reference_required')
    project = [x for x in evidence if x['kind'] == 'project_definition']
    if len(project) != 1 or project[0]['value'].get('id') != source['projectId'] or project[0]['value'].get('status') != 'active':
        fail('project_source_invalid')
    # A separate confirmed-week recommendation contract can be added later.
    # This operation does not reinterpret that plan or declare it confirmed.
    if any(x['kind'] == 'confirmed_week_plan' for x in evidence):
        fail('mixed_plan_source_denied')
    return source


def parse_request(value, contract, identity):
    if list(Draft202012Validator(contract['schemas']['request']).iter_errors(value)):
        fail('request_schema_invalid')
    if value['scope'] != identity.get('pb_scope'):
        fail('pb_scope_forbidden', 403)
    if any(value['application'][k] != identity[k] for k in ('workspace_id', 'application_id')):
        fail('application_forbidden', 403)
    source = validate_source(source_of(value), value['scope'])
    return dict(intent_id=value['intent_id'], task_kind=KIND,
                snapshot_id=value['application']['snapshot_id'], contract_version=VERSION,
                input_snapshot_hash=value['input_snapshot_hash'],
                input={'source_json': value['source_json']}, pb_request=value)


def check_output(value, contract, request):
    if list(Draft202012Validator(contract['schemas']['model-output']).iter_errors(value)):
        fail('output_schema_invalid')
    source = validate_source(source_of(request), request['scope'])
    refs = {x['ref'] for x in source['evidence']}
    members = {x['actor_id'] for x in source['assignees']}
    required = 'okr:' + source['okr_source']['kr_id']
    existing = set()
    for x in source['evidence']:
        if x['kind'] == 'existing_recommendation':
            existing.add((x['value'].get('assignee_id'), str(x['value'].get('title', '')).casefold()))
        elif x['kind'] == 'formal_task':
            existing.add((x['value'].get('ownerId'), str(x['value'].get('title', '')).casefold()))
    identities = set()
    for item in value['items']:
        for field in ('title', 'reason', 'deliverable'):
            if not item[field].strip() or item[field] != item[field].strip():
                fail('output_text_invalid')
        if type(item['plan_hours']) not in (int, float) or not math.isfinite(item['plan_hours']):
            fail('output_hours_invalid')
        try:
            if date.fromisoformat(item['due_date']).isoformat() != item['due_date'] or item['due_date'] < source['plan_date']:
                fail('output_date_invalid')
        except (TypeError, ValueError):
            fail('output_date_invalid')
        if item['assignee_id'] not in members:
            fail('assignee_denied')
        if len(set(item['evidence_refs'])) != len(item['evidence_refs']) or not set(item['evidence_refs']) <= refs or required not in item['evidence_refs']:
            fail('output_reference_invalid')
        ident = (item['assignee_id'], item['title'].casefold())
        if ident in existing or ident in identities:
            fail('duplicate_recommendation')
        identities.add(ident)
    if not value['notes'].strip():
        fail('output_text_invalid')
    return value


def response(row):
    request = row['request']['pb_request']
    receipt = {k: request[k] for k in ('schema_version', 'task_kind', 'intent_id',
                                      'scope', 'application', 'input_snapshot_hash')}
    receipt.update(run_id=row['id'], state=row['state'], attempts_complete=False, attempts=[])
    return dict(receipt=receipt, model_output=row.get('result'), runtime=dict(
        error_code=row.get('error_code'), cancel_requested=row['cancelled'],
        created_at=row['created_at'], started_at=row.get('started_at'),
        finished_at=row.get('finished_at'), expires_at=row['expires_at'],
        contract_manifest_hash=row['contract']['manifest_hash']))
