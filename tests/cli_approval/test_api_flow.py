"""Isolated browser identities and Redis. Never creates production user sessions."""
import sys
import types
import importlib.util
import time
import uuid
from pathlib import Path
from contextlib import contextmanager
import pytest
import fakeredis
from flask import Flask
from sqlalchemy import create_engine, Column, String
from sqlalchemy.orm import declarative_base, Session
from werkzeug.exceptions import Forbidden

ROOT=Path(__file__).resolve().parents[2]/'installer/runtime/build/api/code/fde_cli'
Base=declarative_base()
class Account(Base):
    __tablename__='accounts'
    id=Column(String,primary_key=True);email=Column(String);name=Column(String);status=Column(String)
class Tenant(Base):
    __tablename__='tenants'
    id=Column(String,primary_key=True);name=Column(String)
class Member(Base):
    __tablename__='tenant_account_joins'
    id=Column(String,primary_key=True);account_id=Column(String);tenant_id=Column(String);role=Column(String)

@pytest.fixture
def env(monkeypatch):
    w,other,p,user,admin=[str(uuid.uuid4()) for _ in range(5)]
    engine=create_engine('sqlite://');Base.metadata.create_all(engine)
    with Session(engine) as s:
        s.add_all([Account(id=user,email='test-user@example.invalid',name='Test',status='active'),Account(id=admin,email='test-owner@example.invalid',name='Owner',status='active'),Tenant(id=w,name='ProjectBuddy'),Tenant(id=other,name='SalesBuddy')])
        for ws in (w,other):
            s.add(Member(id=str(uuid.uuid4()),account_id=user,tenant_id=ws,role='editor'))
            s.add(Member(id=str(uuid.uuid4()),account_id=admin,tenant_id=ws,role='owner'))
        s.commit()
    def module(name,**attrs):
        m=types.ModuleType(name);m.__dict__.update(attrs);monkeypatch.setitem(sys.modules,name,m);return m
    pkg=module('fde_cli');pkg.__path__=[str(ROOT)]
    module('extensions');module('extensions.ext_redis',redis_client=fakeredis.FakeRedis())
    module('core');module('core.db');module('core.db.session_factory',session_factory=types.SimpleNamespace(create_session=lambda:Session(engine)))
    module('models',Account=Account,TenantAccountJoin=Member,Tenant=Tenant)
    module('libs');module('libs.passport',PassportService=type('Passport',(),{'verify':lambda self,t:{'user_id':t}}))
    def csrf(req,account):
        if req.headers.get('X-CSRF-Token')!='test-csrf':raise Forbidden('CSRF rejected')
    module('libs.token',extract_console_cookie_token=lambda req:req.headers.get('X-Test-User'),check_csrf_token=csrf)
    calls=[]
    def execute(req,**kwargs):
        kwargs['authorization_check']();calls.append(req);return {'id':'isolated-result'}
    module('fde_cli.worker',execute=execute)
    for name in ('approval_store','approval_routes','api'):
        spec=importlib.util.spec_from_file_location('fde_cli.'+name,ROOT/(name+'.py'))
        m=importlib.util.module_from_spec(spec);monkeypatch.setitem(sys.modules,'fde_cli.'+name,m);spec.loader.exec_module(m)
    store=sys.modules['fde_cli.approval_store'];store.metadata.create_all(engine)
    api=sys.modules['fde_cli.api'];app=Flask(__name__)
    from flask_orjson import OrjsonProvider
    app.json=OrjsonProvider(app)
    app.register_blueprint(api.bp)
    client=app.test_client()
    def headers(actor=user):return {'X-Test-User':actor,'Origin':api.ORIGIN,'X-CSRF-Token':'test-csrf'}
    def apply(actions=None):
        now=int(time.time());data=dict(workspace_id=w,project_id=p,project_name='ProjectBuddy test',purpose='isolated test',actions=actions or ['get','list'],starts_at=now,expires_at=now+3600)
        r=client.post('/fde-cli/v1/approvals',json=data,headers=headers());assert r.status_code==201,r.json
        return r.json['data']
    def approve(row):
        r=client.post('/fde-cli/v1/approvals/'+row['id']+'/decision',headers=headers(admin),json=dict(revision=1,decision='approve',actions=row['requested_actions'],starts_at=row['starts_at'],expires_at=row['expires_at'],reason='test'))
        assert r.status_code==200,r.json
    def start(row):
        r=client.post('/fde-cli/v1/auth/start',json=dict(workspace=w,project_id=p,authorization_id=row['id']))
        assert r.status_code==200,r.json
        from urllib.parse import urlparse,parse_qs
        data=r.json['data'];code=parse_qs(urlparse(data['verification_uri']).query)['request'][0]
        return data,code
    def token(row):
        device,code=start(row)
        r=client.post('/fde-cli/v1/auth/approve',json={'request':code},headers=headers());assert r.status_code==200,r.json
        r=client.post('/fde-cli/v1/auth/poll',json={'device_code':device['device_code']});assert r.status_code==200,r.json
        return r.json['data']
    return types.SimpleNamespace(**locals())


def test_nonempty_records_with_production_json_encoder(env):
    e=env
    row=e.apply()
    path='/fde-cli/v1/approvals'
    response=e.client.get(path,query_string={'workspace_id':e.w},headers=e.headers())
    assert response.status_code==200,response.json
    assert response.json['data']['items'][0]['id']==row['id']
    e.approve(row)
    response=e.client.get(path+'/'+row['id']+'/events',headers=e.headers())
    assert response.status_code==200,response.json
    assert {x['kind'] for x in response.json['data']['items']}=={'requested','approve'}
    response=e.client.post(path+'/'+row['id']+'/revoke',headers=e.headers(),json={'reason':'test cleanup'})
    assert response.status_code==200,response.json
    assert response.json['data']['status']=='revoked'

def test_full_flow_and_cross_space(env):
    e=env;r=e.apply();e.approve(r);g=e.token(r)
    assert g['expires_at']==r['expires_at']
    h={'Authorization':'Bearer '+g['token'],'X-Raccoon-Project':e.p}
    assert e.client.get('/fde-cli/v1/auth/me',headers=h).json['data']['actions']==['get','list']
    body={'workspace':e.w,'project_id':e.p,'action':'list'}
    assert e.client.post('/fde-cli/v1/agent',headers=h,json=body).status_code==200
    assert len(e.calls)==1
    for patch in ({'workspace':e.other},{'project_id':str(uuid.uuid4())},{'action':'create','dry_run':True},{'action':'publish','dry_run':True}):
        assert e.client.post('/fde-cli/v1/agent',headers=h,json=dict(body,**patch)).status_code==403
    assert len(e.calls)==1
    assert e.client.get('/fde-cli/v1/auth/me',headers=dict(h,**{'X-Raccoon-Project':str(uuid.uuid4())})).status_code==403

def test_revoke_all_tokens_and_pending(env):
    e=env;r=e.apply();e.approve(r);g1=e.token(r);g2=e.token(r);device,code=e.start(r)
    response=e.client.post('/fde-cli/v1/approvals/'+r['id']+'/revoke',headers=e.headers(),json={'reason':'test revoke'})
    assert response.status_code==200,response.json
    for g in (g1,g2):
        assert e.client.get('/fde-cli/v1/auth/me',headers={'Authorization':'Bearer '+g['token'],'X-Raccoon-Project':e.p}).status_code==403
    assert e.client.post('/fde-cli/v1/auth/approve',headers=e.headers(),json={'request':code}).status_code==403
    _,new_code=e.start(r)
    assert e.client.get('/fde-cli/v1/auth/context?request='+new_code,headers=e.headers()).status_code==403

def test_browser_security_and_self_approval(env):
    e=env;r=e.apply()
    endpoint='/fde-cli/v1/approvals/'+r['id']+'/decision'
    assert e.client.post(endpoint,json={},headers=e.headers()).status_code==403
    assert e.client.post(endpoint,json={},headers={'X-Test-User':e.admin}).status_code==403
    assert e.client.get('/fde-cli/v1/approvals?workspace_id='+e.w+'&view=space',headers=e.headers()).status_code==403
    e.approve(r);device,code=e.start(r)
    assert e.client.post('/fde-cli/v1/auth/approve',json={'request':code},headers=e.headers(e.admin)).status_code==403
    assert e.client.post('/fde-cli/v1/auth/approve',json={'request':code},headers=e.headers()).status_code==200
    assert e.client.post('/fde-cli/v1/auth/approve',json={'request':code},headers=e.headers()).status_code==400
    assert e.client.post('/fde-cli/v1/auth/poll',json={'device_code':device['device_code']}).status_code==200
    assert e.client.post('/fde-cli/v1/auth/poll',json={'device_code':device['device_code']}).status_code==400

def test_no_legacy_login(env):
    e=env
    assert e.client.post('/fde-cli/v1/auth/start',json={'workspace':e.w}).status_code==400
    assert e.client.post('/fde-cli/v1/auth/start',json={'project_id':e.p}).status_code==400

def test_poll_after_revoke(env):
    e=env;r=e.apply();e.approve(r);device,code=e.start(r)
    assert e.client.post('/fde-cli/v1/auth/approve',headers=e.headers(),json={'request':code}).status_code==200
    e.client.post('/fde-cli/v1/approvals/'+r['id']+'/revoke',headers=e.headers(),json={'reason':'cancel'})
    assert e.client.post('/fde-cli/v1/auth/poll',json={'device_code':device['device_code']}).status_code==403

def test_access_disable_does_not_revive(env):
    e=env;r=e.apply();e.approve(r);g=e.token(r)
    endpoint='/fde-cli/v1/approvals/access'
    body=dict(workspace_id=e.w,account_id=e.user,enabled=False,reason='停用测试')
    assert e.client.post(endpoint,headers=e.headers(),json=body).status_code==403
    assert e.client.post(endpoint,headers=e.headers(e.admin),json=body).status_code==200
    assert e.client.post(endpoint,headers=e.headers(e.admin),json=dict(body,enabled=True)).status_code==200
    h={'Authorization':'Bearer '+g['token'],'X-Raccoon-Project':e.p}
    assert e.client.get('/fde-cli/v1/auth/me',headers=h).status_code==403

def test_admin_needs_explicit_delegation(env):
    e=env;delegate=str(uuid.uuid4())
    with Session(e.engine) as s:
        s.add(Account(id=delegate,email='delegate@example.invalid',name='Delegate',status='active'))
        s.add(Member(id=str(uuid.uuid4()),account_id=delegate,tenant_id=e.w,role='admin'));s.commit()
    r=e.apply();endpoint='/fde-cli/v1/approvals/'+r['id']+'/decision'
    data=dict(revision=1,decision='approve',actions=r['requested_actions'],starts_at=r['starts_at'],expires_at=r['expires_at'],reason='test')
    assert e.client.post(endpoint,headers=e.headers(delegate),json=data).status_code==403
    assert e.client.post('/fde-cli/v1/approvals/approvers',headers=e.headers(e.admin),json=dict(workspace_id=e.w,account_id=delegate,enabled=True)).status_code==200
    assert e.client.post(endpoint,headers=e.headers(delegate),json=data).status_code==200

def test_platform_admin_is_explicit_and_cannot_self_approve(env):
    e=env;platform=str(uuid.uuid4())
    with Session(e.engine) as s:
        s.add(Account(id=platform,email='platform@example.invalid',name='Emergency admin',status='active'));s.commit()
    r=e.apply()
    assert e.client.post('/fde-cli/v1/approvals/'+r['id']+'/revoke',headers=e.headers(platform),json={'reason':'emergency'}).status_code==403
    e.api.PLATFORM_ADMINS=frozenset({platform})
    assert e.client.post('/fde-cli/v1/approvals/'+r['id']+'/revoke',headers=e.headers(platform),json={'reason':'emergency'}).status_code==200

@pytest.mark.parametrize('attribute', ['sqlstate', 'pgcode'])
def test_lock_timeout_driver_codes(env, attribute):
    from sqlalchemy.exc import DBAPIError
    cause=Exception('lock timeout');setattr(cause,attribute,'55P03')
    with env.app.app_context():
        response,status=env.api.error(DBAPIError(None,None,cause))
        assert status==503
        assert '勿自动重试' in response.json['error']
