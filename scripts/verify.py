#!/usr/bin/env python3
"""Check the distributable, including the nested Web tarball, without printing values."""
from pathlib import Path
import ast,tarfile,re,json,hashlib
root=Path(__file__).resolve().parent.parent/'installer'
bad=[];count=0
patterns=[rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
 rb'gh[pousr]_[A-Za-z0-9]{30,}',rb'github_pat_[A-Za-z0-9_]{50,}',
 rb'AKIA[A-Z0-9]{16}', rb'rx_okr_[A-Za-z0-9_-]{35,}', rb'sk-(?:proj-)?(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{40,}',
 rb'123\.207\.235\.181',rb'@sensetime\.com',rb'@salesbuddy\.com']
def check(name,data):
 global count
 count+=1
 if Path(name).name.startswith('._') or Path(name).name=='.DS_Store':bad.append(name)
 if any(re.search(p,data) for p in patterns):bad.append(name)
 if Path(name).name in {'.env','session.json','server.key','instance.json','首次登录.txt','runtime-private.json','native.env'}:bad.append(name)
for p in root.rglob('*'):
 if not p.is_file():continue
 if p.suffix=='.tgz':
  with tarfile.open(p) as t:
   for m in t.getmembers():
    assert not m.name.startswith('/') and '..' not in Path(m.name).parts,m.name
    if m.isfile():check(str(p.relative_to(root))+'!'+m.name,t.extractfile(m).read())
 else:check(str(p.relative_to(root)),p.read_bytes())
for p in root.glob('*.py'):ast.parse(p.read_text())
compose=json.loads((root/'runtime/compose.json').read_text())
assert [n for n,s in compose['services'].items() if s.get('ports')]==['nginx']
assert not bad,'Review candidate files (values withheld): '+repr(sorted(set(bad)))
print('Distribution scan passed:',count,'files; only HTTPS ingress is published.')
