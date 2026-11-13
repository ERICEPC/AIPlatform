CREATE TABLE IF NOT EXISTS personal_harness_configs (
  tenant_id uuid NOT NULL,
  account_id uuid NOT NULL,
  config jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  applied_revision integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, account_id)
);
CREATE TABLE IF NOT EXISTS personal_harness_sessions (
  session_id varchar(128) PRIMARY KEY,
  tenant_id uuid NOT NULL,
  account_id uuid NOT NULL,
  revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
