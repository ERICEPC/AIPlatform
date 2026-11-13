import importlib.util
import sys
from pathlib import Path
import uuid
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from werkzeug.exceptions import Forbidden, BadRequest, Conflict

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'installer/runtime/build/api/code/fde_cli'))
from approval_store import ApprovalStore, metadata, grants, events

W, OTHER_W, P, OTHER_P, USER, ADMIN, OTHER_ADMIN = [str(uuid.uuid4()) for _ in range(7)]
NOW = 2_000_000_000

@pytest.fixture
def store():
    engine = create_engine('sqlite://')
    metadata.create_all(engine)
    with Session(engine) as session:
        yield ApprovalStore(session, lambda: NOW)

def request_data(**patch):
    return dict(dict(workspace_id=W,project_id=P,project_name='ProjectBuddy',purpose='受控测试',
        actions=['doctor','list','get'],starts_at=NOW,expires_at=NOW+604800), **patch)

def approved(store, **patch):
    r=store.request(USER,W,'editor',request_data(**patch))
    return store.decide(r['id'],ADMIN,'owner',W,dict(decision='approve',revision=1,
        actions=r['requested_actions'],starts_at=r['starts_at'],expires_at=r['expires_at'],reason='同意测试'),'editor')

def test_success_and_audit(store):
    r=approved(store)
    assert store.check(r['id'],USER,W,P,'editor','get')['effective_actions']==['doctor','get','list']
    assert [x.kind for x in store.session.execute(select(events))]==['requested','approve']
    assert r['revision']==2

@pytest.mark.parametrize('patch',[{'workspace_id':None},{'project_id':''},{'actions':[]},{'actions':['shell']},
    {'starts_at':NOW-1000},{'expires_at':NOW},{'expires_at':NOW+604801},{'expires_at':True},
    {'purpose':''},{'account_id':ADMIN}])
def test_invalid_request(store,patch):
    with pytest.raises(BadRequest):store.request(USER,W,'editor',request_data(**patch))

@pytest.mark.parametrize('actor,role,workspace',[(USER,'owner',W),(ADMIN,'editor',W),(ADMIN,'owner',OTHER_W)])
def test_bad_approver(store,actor,role,workspace):
    r=store.request(USER,W,'editor',request_data())
    with pytest.raises(Forbidden):store.decide(r['id'],actor,role,workspace,{},'editor')

@pytest.mark.parametrize('patch,error',[
    ({'actions':['publish']},Forbidden),({'expires_at':NOW+604801},BadRequest),
    ({'starts_at':NOW-1},BadRequest),({'revision':0},Conflict),({'decision':'auto'},BadRequest)])
def test_cannot_expand_approval(store,patch,error):
    r=store.request(USER,W,'editor',request_data())
    d=dict(decision='approve',revision=1,actions=['get'],starts_at=NOW,expires_at=NOW+100,reason='批准')
    d.update(patch)
    with pytest.raises(error):store.decide(r['id'],ADMIN,'admin',W,d,'editor')

@pytest.mark.parametrize('actor,workspace,project,role,action',[(USER,OTHER_W,P,'editor','get'),
    (USER,W,OTHER_P,'editor','get'),(ADMIN,W,P,'editor','get'),(USER,W,P,'editor','create'),
    (USER,W,P,'editor','configure'),(USER,W,P,'editor','publish'),(USER,W,P,'removed','get')])
def test_scope_enforcement(store,actor,workspace,project,role,action):
    r=approved(store)
    with pytest.raises(Forbidden):store.check(r['id'],actor,workspace,project,role,action)

def test_modify_is_not_publish(store):
    r=approved(store,actions=['configure'])
    with pytest.raises(Forbidden):store.check(r['id'],USER,W,P,'editor','publish')
    with pytest.raises(Forbidden):store.check(r['id'],USER,W,P,'normal','configure')

@pytest.mark.parametrize('delta',[-1,604800])
def test_time_boundaries(store,delta):
    r=approved(store);store.clock=lambda:NOW+delta
    with pytest.raises(Forbidden):store.check(r['id'],USER,W,P,'editor')

def test_revoke_project_independence(store):
    r=approved(store);other=approved(store,project_id=OTHER_P)
    store.revoke(r['id'],USER,'editor',W,'不再需要')
    with pytest.raises(Forbidden):store.check(r['id'],USER,W,P,'editor')
    assert store.check(other['id'],USER,W,OTHER_P,'editor')
    with pytest.raises(Conflict):store.decide(r['id'],ADMIN,'owner',W,{'revision':3},'editor')

@pytest.mark.parametrize('actor,role,workspace',[(OTHER_ADMIN,'editor',W),(ADMIN,'owner',OTHER_W)])
def test_revoke_permissions(store,actor,role,workspace):
    r=approved(store)
    with pytest.raises(Forbidden):store.revoke(r['id'],actor,role,workspace,'拒绝')

def test_no_mutation_on_failed_approval(store):
    r=store.request(USER,W,'editor',request_data())
    with pytest.raises(Forbidden):store.decide(r['id'],USER,'owner',W,{},'editor')
    assert store.get(r['id'])['status']=='pending'
    assert len(store.session.execute(select(events)).all())==1

def test_client_no_fallback():
    spec=importlib.util.spec_from_file_location('approval_cli',Path(__file__).resolve().parents[2]/'installer/cli/raccoon.py')
    cli=importlib.util.module_from_spec(spec);spec.loader.exec_module(cli)
    cli.PROJECT_ID=P;cli.BOUND_WORKSPACE=W
    with pytest.raises(ValueError):cli.check_identity({'ok':True,'data':{'workspace_id':W,'project_id':OTHER_P}})
    with pytest.raises(SystemExit):cli.parser().parse_args(['auth','login'])
