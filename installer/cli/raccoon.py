#!/usr/bin/env python3
"""Supreme FDE personal CLI: browser login, account-scoped workspace access."""
import argparse
import json
import os
from pathlib import Path
import socket
import sys
import time
import urllib.error
import urllib.request
import webbrowser

VERSION = '2.1.0'
SERVER = None
CONFIG = None
BOUND_WORKSPACE = None
PROJECT_ID = None


def workspace_id(workspace):
    if workspace != BOUND_WORKSPACE:
        raise ValueError('Workspace conflicts with fixed project binding')
    return workspace


def session_path(workspace=None, existing=False):
    return CONFIG/'session.json'  # no legacy lookup, no alternate workspace lookup


def bind_project(args):
    from uuid import UUID
    from urllib.parse import urlparse
    global SERVER, CONFIG, BOUND_WORKSPACE, PROJECT_ID
    data=json.loads(Path(args.project).read_text())
    if set(data)!={'schema_version','project_id','profile','server','workspace_id'} or data['schema_version']!=1:
        raise ValueError('Invalid project configuration')
    PROJECT_ID=str(UUID(data['project_id']))
    BOUND_WORKSPACE=str(UUID(data['workspace_id']))
    SERVER=data['server'].rstrip('/')
    u=urlparse(SERVER)
    if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path:
        raise ValueError('server must be an HTTPS origin')
    if args.workspace is not None and args.workspace!=BOUND_WORKSPACE:
        raise ValueError('Workspace conflicts with project binding; no credential was selected')
    args.workspace=BOUND_WORKSPACE
    CONFIG=Path.home()/'.config'/'raccoonx'/'projects'/PROJECT_ID


def initialize(args):
    from uuid import UUID,uuid4
    from urllib.parse import urlparse
    if not args.workspace or not args.server or not args.profile:
        raise ValueError('init requires --workspace, --server and --profile')
    workspace=str(UUID(args.workspace));server=args.server.rstrip('/');u=urlparse(server)
    if u.scheme!='https' or not u.hostname or u.username or u.password or u.path or u.query or u.fragment:
        raise ValueError('server must be an HTTPS origin')
    data=dict(schema_version=1,project_id=str(uuid4()),profile=args.profile,server=server,workspace_id=workspace)
    with Path(args.project).open('x') as f:json.dump(data,f,ensure_ascii=False,indent=2)
    return dict(ok=True,data=data)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http(path, data=None, token=None):
    headers = {'Accept':'application/json'}
    if data is not None: headers['Content-Type']='application/json'
    if token:
        headers['Authorization']='Bearer '+token
        headers['X-Raccoon-Project']=PROJECT_ID
    req = urllib.request.Request(SERVER+'/fde-cli/v1'+path, headers=headers, data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=90) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as e:
        try: return e.code, json.load(e)
        except (ValueError, UnicodeError): return e.code, {'ok':False,'error':'HTTP '+str(e.code)}


def load_token(workspace=None):
    data=json.loads(session_path(workspace, existing=True).read_text())
    if data.get('server') != SERVER or data.get('workspace_id') != BOUND_WORKSPACE or data.get('project_id') != PROJECT_ID:
        raise ValueError('凭据服务器或空间不匹配，请重新 auth login')
    if workspace is not None and data.get('workspace_id') != workspace_id(workspace):
        raise ValueError('请先为该空间单独执行 --workspace '+workspace+' auth login')
    if data.get('expires_at',0) <= time.time(): raise ValueError('授权已过期，请重新 auth login')
    return data['token']


def save_token(data, workspace=None):
    if workspace is not None and data.get('workspace_id') != workspace_id(workspace):
        raise ValueError('服务端授权空间与请求不一致，未保存凭据')
    CONFIG.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(CONFIG,0o700)
    temp=CONFIG/('session.'+os.urandom(6).hex()+'.tmp')
    fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        with os.fdopen(fd,'w') as out: json.dump(dict(data,server=SERVER,project_id=PROJECT_ID),out)
        os.replace(temp,session_path(workspace))
    finally:
        if temp.exists():temp.unlink()


def parser():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--project',default='raccoon.json',help='Exact project config path; no parent directory search')
    p.add_argument('--workspace',help='Optional assertion; cannot change project workspace')
    p.add_argument('--version',action='version',version=VERSION)
    commands=p.add_subparsers(dest='action',required=True)
    init=commands.add_parser('init')
    init.add_argument('--server',required=True)
    init.add_argument('--profile',required=True)
    commands.add_parser('capabilities')
    auth=commands.add_parser('auth').add_subparsers(dest='auth_action',required=True)
    login=auth.add_parser('login');login.add_argument('--authorization',required=True,help='Approved authorization UUID from approval center');login.add_argument('--no-browser',action='store_true');login.add_argument('--label',default=socket.gethostname()+' / Codex')
    auth.add_parser('whoami');auth.add_parser('logout')
    commands.add_parser('doctor');commands.add_parser('list')
    create=commands.add_parser('create');create.add_argument('--file',required=True);create.add_argument('--dry-run',action='store_true')
    get=commands.add_parser('get');get.add_argument('id')
    configure=commands.add_parser('configure');configure.add_argument('id');configure.add_argument('--file',required=True);configure.add_argument('--revision',required=True);configure.add_argument('--dry-run',action='store_true')
    publish=commands.add_parser('publish');publish.add_argument('id');publish.add_argument('--revision',required=True);publish.add_argument('--note',default='Published by personal Codex CLI');publish.add_argument('--dry-run',action='store_true')
    return p


def build_request(args):
    data={k:v for k,v in vars(args).items() if k not in ('file','project')}
    if hasattr(args,'file'):
        value=json.loads(Path(args.file).read_text())
        if not isinstance(value,dict):raise ValueError('JSON 顶层必须是对象')
        data['spec' if args.action=='create' else 'patch']=value
    data['project_id']=PROJECT_ID
    return data


def check_identity(response):
    if not response.get('ok'):
        raise ValueError(response.get('error','Identity check failed'))
    if response['data'].get('project_id') != PROJECT_ID:
        raise ValueError('Server grant does not match project identity')
    if response['data'].get('workspace_id')!=BOUND_WORKSPACE:
        raise ValueError('Server grant does not match project workspace')


def main():
    args=parser().parse_args()
    try:
        if args.action=='init':
            print(json.dumps(initialize(args),ensure_ascii=False,indent=2));return 0
        bind_project(args)
        _,cap=http('/capabilities')
        if not cap.get('ok') or cap['data'].get('contract')!='raccoon-cli-v2':
            raise ValueError('Server does not support strict raccoon-cli-v2 contract')
        if not cap['data'].get('approval_required') or not cap['data'].get('project_binding_required'):
            raise ValueError('Server has not enabled approval contract; do not fall back to legacy login')
        if args.action=='capabilities':
            print(json.dumps(cap,ensure_ascii=False,indent=2));return 0
        if args.action=='auth':
            if args.auth_action=='login':
                _, response=http('/auth/start',{'label':args.label, 'workspace':workspace_id(args.workspace), 'project_id':PROJECT_ID, 'authorization_id':args.authorization})
                if not response.get('ok'):raise ValueError(response.get('error'))
                data=response['data'];url=data['verification_uri']
                if not url.startswith(SERVER+'/fde-cli/v1/authorize?'):raise ValueError('授权地址异常')
                print('用自己的平台账号打开并确认：\n'+url+'\n确认码：'+data['user_code'],file=sys.stderr,flush=True)
                if not args.no_browser:webbrowser.open(url)
                deadline=time.monotonic()+min(data['expires_in'],600)
                while time.monotonic()<deadline:
                    time.sleep(max(data.get('interval',3),3))
                    code,response=http('/auth/poll',{'device_code':data['device_code']})
                    if response.get('ok'):
                        grant=response['data']
                        _,response=http('/auth/me',token=grant['token'])
                        check_identity(response)
                        save_token(grant, args.workspace)
                        break
                    if code != 202:raise ValueError(response.get('error'))
                else:raise ValueError('登录确认超时，请重新 auth login')
            else:
                token=load_token(args.workspace)
                _,response=http('/auth/me' if args.auth_action=='whoami' else '/auth/logout',None if args.auth_action=='whoami' else {},token)
                if args.auth_action=='whoami':check_identity(response)
                if args.auth_action=='logout' and response.get('ok'):session_path(args.workspace, existing=True).unlink(missing_ok=True)
        else:
            token=load_token(args.workspace)
            _,identity=http('/auth/me',token=token)
            check_identity(identity)
            _,response=http('/agent',build_request(args),token)
        print(json.dumps(response,ensure_ascii=False,indent=2))
        return 0 if response.get('ok') else 1
    except (OSError, ValueError, KeyError, urllib.error.URLError) as e:
        print(json.dumps(dict(ok=False,error='client_error',message=str(e)),ensure_ascii=False),file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print('已取消。',file=sys.stderr);return 130

if __name__=='__main__':sys.exit(main())
