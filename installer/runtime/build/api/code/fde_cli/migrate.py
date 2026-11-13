"""Run explicitly inside API application after backup; never on web startup."""
from sqlalchemy import text
if __package__:
    from .approval_store import metadata
else:
    from approval_store import metadata

# Revocation happens in the SAME transaction as membership/account changes.
# Row updates serialize with CLI grant_scope; rejoining cannot revive old grants.
# Separate functions avoid accessing fields absent in the trigger's record type.
MEMBER_FUNCTION = r"""
CREATE OR REPLACE FUNCTION raccoon_cli_close_member_grants() RETURNS trigger AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM raccoon_cli_grants
    WHERE account_id=OLD.account_id::text AND workspace_id=OLD.tenant_id::text
      AND status IN ('pending','approved') ORDER BY id FOR UPDATE
  LOOP
    UPDATE raccoon_cli_grants SET status='revoked',reason='membership_removed',revision=revision+1 WHERE id=r.id;
    INSERT INTO raccoon_cli_grant_events(id,grant_id,actor_id,kind,at,details)
      VALUES(gen_random_uuid()::text,r.id,'system','membership_removed',EXTRACT(EPOCH FROM NOW())::bigint,'{}'::json);
  END LOOP;
  DELETE FROM raccoon_cli_approvers WHERE account_id=OLD.account_id::text AND workspace_id=OLD.tenant_id::text;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS raccoon_cli_member_removed ON tenant_account_joins;
CREATE TRIGGER raccoon_cli_member_removed BEFORE DELETE ON tenant_account_joins
FOR EACH ROW EXECUTE FUNCTION raccoon_cli_close_member_grants();
DROP TRIGGER IF EXISTS raccoon_cli_member_rebound ON tenant_account_joins;
CREATE TRIGGER raccoon_cli_member_rebound BEFORE UPDATE OF account_id,tenant_id ON tenant_account_joins
FOR EACH ROW WHEN (OLD.account_id IS DISTINCT FROM NEW.account_id OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id)
EXECUTE FUNCTION raccoon_cli_close_member_grants();
"""
ACCOUNT_FUNCTION = r"""
CREATE OR REPLACE FUNCTION raccoon_cli_close_account_grants() RETURNS trigger AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM raccoon_cli_grants WHERE account_id=OLD.id::text
    AND status IN ('pending','approved') ORDER BY id FOR UPDATE
  LOOP
    UPDATE raccoon_cli_grants SET status='revoked',reason='account_disabled',revision=revision+1 WHERE id=r.id;
    INSERT INTO raccoon_cli_grant_events(id,grant_id,actor_id,kind,at,details)
      VALUES(gen_random_uuid()::text,r.id,'system','account_disabled',EXTRACT(EPOCH FROM NOW())::bigint,'{}'::json);
  END LOOP;
  DELETE FROM raccoon_cli_approvers WHERE account_id=OLD.id::text;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS raccoon_cli_account_disabled ON accounts;
CREATE TRIGGER raccoon_cli_account_disabled BEFORE UPDATE OF status ON accounts
FOR EACH ROW WHEN (NEW.status <> 'active') EXECUTE FUNCTION raccoon_cli_close_account_grants();
DROP TRIGGER IF EXISTS raccoon_cli_account_deleted ON accounts;
CREATE TRIGGER raccoon_cli_account_deleted BEFORE DELETE ON accounts
FOR EACH ROW EXECUTE FUNCTION raccoon_cli_close_account_grants();
"""

def migrate(engine):
    if engine.dialect.name != 'postgresql':
        raise RuntimeError('Production migration requires PostgreSQL')
    with engine.begin() as connection:
        metadata.create_all(connection)
        connection.execute(text(MEMBER_FUNCTION))
        connection.execute(text(ACCOUNT_FUNCTION))
