from pathlib import Path
import ast,hashlib,json,shutil,tarfile
base=Path(__file__).resolve().parent.parent
root=base/'installer';dist=base/'dist';name='RaccoonX-2026.10.28'
for p in root.rglob('__pycache__'):shutil.rmtree(p)
files=sorted(p for p in root.rglob('*') if p.is_file() and p.name!='SHA256SUMS')
for p in files:
 assert not p.name.startswith('._') and p.name!='.DS_Store'
 assert '.private' not in p.parts and p.name not in ['.env','server.key','session.json']
 assert p.suffix not in ['.pem','.log','.dump','.pyc']
for p in root.glob('*.py'):ast.parse(p.read_text())
(root/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(root).as_posix()+'\n' for p in files))
files.append(root/'SHA256SUMS');dist.mkdir(exist_ok=True)
archive=dist/(name+'.tar.gz')
def normalize(info):
 info.uid=0;info.gid=0;info.uname='root';info.gname='root';info.pax_headers={}
 info.mode=0o755 if info.name.endswith('.sh') else 0o644
 return info
with tarfile.open(archive,'w:gz',compresslevel=6,format=tarfile.PAX_FORMAT) as t:
 for p in files:t.add(p,arcname=name+'/'+p.relative_to(root).as_posix(),recursive=False,filter=normalize)
# Verify every archived file against the embedded manifest, and reject extra files.
with tarfile.open(archive,'r:gz') as t:
 manifest=t.extractfile(name+'/SHA256SUMS').read().decode()
 expected={path:sha for sha,path in (line.split('  ',1) for line in manifest.splitlines())}
 assert {m.name for m in t.getmembers()}=={name+'/'+p for p in expected}|{name+'/SHA256SUMS'}
 for p,sha in expected.items():assert hashlib.sha256(t.extractfile(name+'/'+p).read()).hexdigest()==sha,p
sha=hashlib.sha256(archive.read_bytes()).hexdigest()
(dist/(name+'.tar.gz.sha256')).write_text(sha+'  '+archive.name+'\n')
shutil.copy2(root/'安装说明.md',dist/'小浣熊Agent中台-安装说明.md')
shutil.copy2(root/'先读我.txt',dist/'小浣熊Agent中台-先读我.txt')
print(json.dumps({'file':str(archive),'size_bytes':archive.stat().st_size,'file_count':len(files),'sha256':sha,'archive_verification':'passed'},ensure_ascii=False,indent=2))
