"""Stable service-principal scope survives key rotation; disabled principals do not."""
import hashlib
import secrets
import time
from uuid import uuid4
from sqlalchemy import Table,Column,String,Float,Boolean,JSON,select
from .store import metadata
from .contracts import Fault
principals=Table('raccoon_okr_principals',metadata,
 Column('id',String,primary_key=True),Column('workspace_id',String,nullable=False),
 Column('application_id',String,nullable=False),Column('account_id',String,nullable=False),
 Column('enabled',Boolean,nullable=False,default=True),Column('pb_scope',JSON))
keys=Table('raccoon_okr_keys',metadata,
 Column('id',String,primary_key=True),Column('principal_id',String,nullable=False),
 Column('token_hash',String,unique=True,nullable=False),Column('expires_at',Float,nullable=False),
 Column('revoked',Boolean,nullable=False,default=False))

def issue_key(connection,principal_id,expires_at,clock=time.time,token_prefix='rx_okr_'):
 if token_prefix not in {'rx_okr_','rx_rec_'}:raise Fault('invalid_credential_profile')
 if not clock()<expires_at<=clock()+90*86400:raise Fault('invalid_key_expiry')
 p=connection.execute(select(principals).where(principals.c.id==principal_id,principals.c.enabled==True)).first()
 if not p:raise Fault('principal_unavailable',403)
 token=token_prefix+secrets.token_urlsafe(32)
 connection.execute(keys.insert().values(id=str(uuid4()),principal_id=principal_id,token_hash=hashlib.sha256(token.encode()).hexdigest(),expires_at=expires_at,revoked=False))
 return token # Provisioning caller must deliver privately; never log this return.

class Authenticator:
 def __init__(self,engine,membership_check,clock=time.time,token_prefix='rx_okr_'):
  if token_prefix not in {'rx_okr_','rx_rec_'}:raise ValueError('invalid credential profile')
  self.engine,self.member,self.clock,self.token_prefix=engine,membership_check,clock,token_prefix
 def __call__(self,header,app_id):
  if not header.startswith('Bearer '+self.token_prefix) or len(header)>256:raise Fault('invalid_credentials',401)
  hashed=hashlib.sha256(header[7:].encode()).hexdigest()
  with self.engine.connect() as c:
   row=c.execute(select(principals).join(keys,keys.c.principal_id==principals.c.id).where(keys.c.token_hash==hashed,keys.c.revoked==False,keys.c.expires_at>self.clock(),principals.c.enabled==True)).mappings().first()
  if not row:raise Fault('invalid_credentials',401)
  if row['application_id']!=app_id:raise Fault('application_forbidden',403)
  if not self.member(row['account_id'],row['workspace_id']):raise Fault('membership_forbidden',403)
  return dict(principal_id=row['id'],workspace_id=row['workspace_id'],application_id=row['application_id'],pb_scope=row['pb_scope'])
 def principal_active(self,job):
  with self.engine.connect() as c:
   row=c.execute(select(principals).where(principals.c.id==job['principal_id'],principals.c.workspace_id==job['workspace_id'],principals.c.application_id==job['application_id'],principals.c.enabled==True)).mappings().first()
  return bool(row and self.member(row['account_id'],row['workspace_id']) and (not job['request'].get('pb_request') or row['pb_scope']==job['request']['pb_request']['scope']))
