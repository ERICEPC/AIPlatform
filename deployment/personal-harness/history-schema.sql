ALTER TABLE personal_harness_sessions ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE personal_harness_sessions ADD COLUMN IF NOT EXISTS turns jsonb;
ALTER TABLE personal_harness_sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE personal_harness_sessions ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE personal_harness_sessions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS personal_harness_sessions_account_updated ON personal_harness_sessions(tenant_id,account_id,updated_at DESC);
