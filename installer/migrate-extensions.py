#!/usr/bin/env python3
"""Initialize idempotent extension schemas in this installation's own database."""
from pathlib import Path
import subprocess,time
root=Path(__file__).resolve().parent/'runtime'
cmd=['docker','compose','-f','compose.json']
for attempt in range(60):
 r=subprocess.run(cmd+['exec','-T','db_postgres','sh','-c','pg_isready -h db_postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 if r.returncode==0:break
 time.sleep(2)
else:raise SystemExit('数据库未就绪，未执行迁移。')
for module in ('channel_hub','team_hub'):
 sql=(root/'build/api/code'/module/'schema.sql').read_text()
 subprocess.run(cmd+['exec','-T','db_postgres','sh','-c','PGPASSWORD="$POSTGRES_PASSWORD" psql -h db_postgres -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],input=sql,text=True,cwd=root,check=True)
code="""from app import app
from core.db.session_factory import session_factory
with app.app_context():
 with session_factory.create_session() as session: engine=session.bind
 from fde_cli.migrate import migrate
 migrate(engine)
 from okr_runtime.store import Store
 from okr_runtime import auth,native_binding,native_executor
 Store(engine).migrate()
 print('CLI approval and OKR empty schemas initialized')
"""
subprocess.run(cmd+['run','--rm','--no-deps','-T','--entrypoint','/app/api/.venv/bin/python','api','-c',code],cwd=root,check=True)
print('渠道、Agent Teams、CLI 审批与 OKR 扩展表已就绪；未导入用户或授权。')
