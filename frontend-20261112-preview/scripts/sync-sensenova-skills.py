"""Create a pinned, same-origin Skill market from an inspected SenseNova checkout.
Usage: python3 scripts/sync-sensenova-skills.py /path/to/SenseNova-Skills
Only packages files; never executes upstream scripts or installs dependencies.
"""
import hashlib, json, pathlib, subprocess, sys, zipfile
import yaml
source=pathlib.Path(sys.argv[1]).resolve()
out=pathlib.Path(__file__).resolve().parents[1]/'public'/'sensenova-skills'
out.mkdir(parents=True,exist_ok=True)
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
rows=[]
for md in sorted((source/'skills').glob('*/SKILL.md')):
    root=md.parent; content=md.read_text(); meta=yaml.safe_load(content.split('---',2)[1])
    name=root.name; category=next((c for prefix,c in [('sn-ppt','ppt'),('sn-da','data'),('sn-search','search'),('sn-image','image'),('sn-infographic','image'),('sn-code-video','video'),('sn-motion','html'),('sn-md','html'),('sn-team','collab'),('sn-proactive','collab')] if name.startswith(prefix)),'research')
    files=sorted(p for p in root.rglob('*') if p.is_file() and not p.is_symlink() and '__pycache__' not in p.parts)
    missing=[str(p.relative_to(root)) for p in files if p.read_bytes().startswith(b'version https://git-lfs.github.com/spec/')]
    archive=out/f'{name}.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for p in files:z.write(p,p.relative_to(root))
        z.write(source/'LICENSE','LICENSE-SenseNova.txt')
    rows.append(dict(name=name,description=str(meta.get('description','')),category=category,readme=content,files=len(files),size=archive.stat().st_size,sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),missing=missing,url=f'https://github.com/OpenSenseNova/SenseNova-Skills/tree/{revision}/skills/{name}'))
(out/'catalog.json').write_text(json.dumps(dict(repository='OpenSenseNova/SenseNova-Skills',revision=revision,skills=rows),ensure_ascii=False))
print(f'Packaged {len(rows)} skills at {revision}; incomplete: {sum(bool(r["missing"]) for r in rows)}')
