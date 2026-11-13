CREATE TABLE IF NOT EXISTS raccoon_teams (
 id text PRIMARY KEY, tenant_id text NOT NULL, name text NOT NULL,
 config jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
 published_id text, created_by text NOT NULL,
 created_at double precision NOT NULL, updated_at double precision NOT NULL
);
CREATE INDEX IF NOT EXISTS raccoon_teams_tenant ON raccoon_teams(tenant_id);
ALTER TABLE raccoon_teams ADD COLUMN IF NOT EXISTS deleted_at double precision;
CREATE TABLE IF NOT EXISTS raccoon_team_versions (
 id text PRIMARY KEY, team_id text NOT NULL REFERENCES raccoon_teams(id),
 tenant_id text NOT NULL, version integer NOT NULL, revision integer NOT NULL,
 config jsonb NOT NULL, created_by text NOT NULL, created_at double precision NOT NULL,
 UNIQUE(team_id, version)
);
CREATE TABLE IF NOT EXISTS raccoon_team_keys (
 id text PRIMARY KEY, tenant_id text NOT NULL, team_id text NOT NULL REFERENCES raccoon_teams(id),
 token_hash text NOT NULL UNIQUE, label text NOT NULL, suffix text NOT NULL,
 created_by text NOT NULL, created_at double precision NOT NULL
);
CREATE TABLE IF NOT EXISTS raccoon_team_runs (
 id text PRIMARY KEY, tenant_id text NOT NULL, team_id text NOT NULL REFERENCES raccoon_teams(id),
 snapshot_id text NOT NULL, config jsonb NOT NULL, owner_key text NOT NULL,
 source text NOT NULL, request_key text NOT NULL, request_hash text NOT NULL,
 query text NOT NULL, state text NOT NULL DEFAULT 'queued', answer text NOT NULL DEFAULT '',
 error_code text NOT NULL DEFAULT '', cancelled boolean NOT NULL DEFAULT false,
 created_at double precision NOT NULL, started_at double precision, finished_at double precision,
 UNIQUE(team_id,owner_key,request_key)
);
CREATE INDEX IF NOT EXISTS raccoon_team_runs_queue ON raccoon_team_runs(state,created_at);
CREATE INDEX IF NOT EXISTS raccoon_team_runs_team ON raccoon_team_runs(tenant_id,team_id,created_at);
CREATE TABLE IF NOT EXISTS raccoon_team_steps (
 id text PRIMARY KEY, run_id text NOT NULL REFERENCES raccoon_team_runs(id),
 kind text NOT NULL, agent_id text NOT NULL, snapshot_id text NOT NULL,
 round integer NOT NULL, task text NOT NULL, state text NOT NULL DEFAULT 'running',
 result text NOT NULL DEFAULT '', error_code text NOT NULL DEFAULT '',
 task_id text, user_id text, conversation_id text, message_id text,
 started_at double precision NOT NULL, finished_at double precision
);
CREATE INDEX IF NOT EXISTS raccoon_team_steps_run ON raccoon_team_steps(run_id,started_at);
ALTER TABLE raccoon_channels ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'agent';
ALTER TABLE raccoon_team_runs ADD COLUMN IF NOT EXISTS conversation_id text;
ALTER TABLE raccoon_team_runs ADD COLUMN IF NOT EXISTS turn_number integer;
ALTER TABLE raccoon_team_runs ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS raccoon_team_conversation_turn ON raccoon_team_runs(conversation_id,turn_number) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS raccoon_team_conversation_owner ON raccoon_team_runs(tenant_id,team_id,owner_key,source,created_at) WHERE turn_number=1;
