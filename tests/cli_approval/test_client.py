import importlib.util,json,tempfile,time,unittest,contextlib,io
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('raccoon',Path(__file__).resolve().parents[2]/'installer/cli/raccoon.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
P='00000000-0000-4000-8000-000000000001';S='00000000-0000-4000-8000-000000000002'
class ClientTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.home=patch.object(Path,'home',return_value=self.root);self.home.start()
 def tearDown(self):self.home.stop();self.tmp.cleanup()
 def init(self,name='project',workspace=P):
  p=self.root/(name+'.json');a=m.parser().parse_args(['--project',str(p),'--workspace',workspace,'init','--server','https://example.test','--profile',name]);m.initialize(a);return p
 def bind(self,p,workspace=None):
  args=['--project',str(p)]+(['--workspace',workspace] if workspace else [])+['list'];a=m.parser().parse_args(args);m.bind_project(a);return a
 def save(self,workspace=P):m.save_token(dict(token='fake-'+workspace,workspace_id=workspace,expires_at=time.time()+100),workspace)
 def test_missing_project_no_fallback(self):
  with self.assertRaises(FileNotFoundError):self.bind(self.root/'missing.json')
 def test_init_requires_explicit_space(self):
  a=m.parser().parse_args(['--project',str(self.root/'x.json'),'init','--server','https://example.test','--profile','x'])
  with self.assertRaises(ValueError):m.initialize(a)
 def test_conflicting_parameter_before_credential_or_network(self):
  p=self.init();q=self.init('sales',S);self.bind(q);self.save(S)
  with patch.object(m,'load_token') as load,patch.object(m,'http') as http:
   with self.assertRaises(ValueError):self.bind(p,S)
   load.assert_not_called();http.assert_not_called()
 def test_modified_binding_never_selects_other_project_token(self):
  p=self.init();self.bind(p);self.save();q=self.init('sales',S);self.bind(q);self.save(S)
  v=json.loads(p.read_text());v['workspace_id']=S;p.write_text(json.dumps(v));self.bind(p)
  with self.assertRaises(ValueError):m.load_token(S)
 def test_sessions_independent(self):
  p=self.init();q=self.init('sales',S);self.bind(p);self.save();self.bind(q);self.save(S)
  self.bind(p);self.assertEqual(m.load_token(P),'fake-'+P);m.session_path().unlink();self.bind(q);self.assertEqual(m.load_token(S),'fake-'+S)
 def test_no_global_legacy_fallback(self):
  p=self.init();self.bind(p);old=self.root/'.config'/'supreme-fde';old.mkdir(parents=True);(old/'session.json').write_text('{}')
  with self.assertRaises(FileNotFoundError):m.load_token(P)
 def test_wrong_server_and_project_rejected(self):
  p=self.init();self.bind(p);self.save();path=m.session_path();v=json.loads(path.read_text());v['server']='https://other.test';path.write_text(json.dumps(v))
  with self.assertRaises(ValueError):m.load_token(P)
 def test_no_init_overwrite(self):
  self.init()
  with self.assertRaises(FileExistsError):self.init()
 def test_invalid_http_origin(self):
  p=self.init();v=json.loads(p.read_text());v['server']='http://example.test';p.write_text(json.dumps(v))
  with self.assertRaises(ValueError):self.bind(p)
 def test_expired(self):
  self.bind(self.init());self.save();p=m.session_path();v=json.loads(p.read_text());v['expires_at']=0;p.write_text(json.dumps(v))
  with self.assertRaises(ValueError):m.load_token(P)
 def test_server_identity_is_authoritative(self):
  self.bind(self.init())
  with self.assertRaises(ValueError):m.check_identity({'ok':True,'data':{'workspace_id':S}})
 def test_request_has_no_local_project_metadata(self):
  a=self.bind(self.init());r=m.build_request(a);self.assertNotIn('project',r);self.assertEqual(r['workspace'],P)
 def test_token_not_in_outputs(self):
  self.bind(self.init());self.save();self.assertEqual(m.session_path().stat().st_mode&0o777,0o600)
if __name__=='__main__':unittest.main()
