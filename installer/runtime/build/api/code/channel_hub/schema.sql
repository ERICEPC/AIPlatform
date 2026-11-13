CREATE TABLE IF NOT EXISTS raccoon_channels (
 id text PRIMARY KEY, tenant_id text NOT NULL, agent_id text NOT NULL,
 kind text NOT NULL, name text NOT NULL, credentials text NOT NULL,
 settings text NOT NULL, account_hash text UNIQUE, token_id text,
 target_type text NOT NULL DEFAULT 'agent',
 enabled boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'stopped', status_at double precision NOT NULL DEFAULT 0,
 error_code text NOT NULL DEFAULT '', created_by text NOT NULL,
 created_at double precision NOT NULL, updated_at double precision NOT NULL
);
CREATE INDEX IF NOT EXISTS raccoon_channels_tenant ON raccoon_channels(tenant_id);
CREATE TABLE IF NOT EXISTS raccoon_channel_jobs (
 id text PRIMARY KEY, channel_id text NOT NULL REFERENCES raccoon_channels(id) ON DELETE CASCADE,
 tenant_id text NOT NULL, revision integer NOT NULL, event_key text NOT NULL,
 conversation_key text NOT NULL, payload text NOT NULL, state text NOT NULL DEFAULT 'pending',
 error_code text NOT NULL DEFAULT '', duration double precision, created_at double precision NOT NULL,
 updated_at double precision NOT NULL, UNIQUE(channel_id, event_key)
);
CREATE INDEX IF NOT EXISTS raccoon_channel_jobs_queue ON raccoon_channel_jobs(state, created_at);
CREATE INDEX IF NOT EXISTS raccoon_channel_jobs_channel ON raccoon_channel_jobs(channel_id, created_at);
CREATE TABLE IF NOT EXISTS raccoon_channel_sessions (
 channel_id text NOT NULL REFERENCES raccoon_channels(id) ON DELETE CASCADE,
 conversation_key text NOT NULL, conversation_id text NOT NULL, updated_at double precision NOT NULL,
 PRIMARY KEY(channel_id, conversation_key)
);
CREATE TABLE IF NOT EXISTS raccoon_channel_cursors (
 channel_id text PRIMARY KEY REFERENCES raccoon_channels(id) ON DELETE CASCADE, cursor text NOT NULL
);

-- Workspace resource visibility
CREATE TABLE IF NOT EXISTS resource_visibility (
 tenant_id varchar(36) NOT NULL,
 kind varchar(16) NOT NULL CHECK (kind IN ('agent','skill','mcp')),
 resource_id varchar(36) NOT NULL,
 visibility varchar(16) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
 updated_by varchar(36) NOT NULL,
 updated_at timestamp NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,kind,resource_id)
);
CREATE INDEX IF NOT EXISTS resource_visibility_public ON resource_visibility (tenant_id,kind,visibility);

-- Human decision inbox
CREATE TABLE IF NOT EXISTS human_reviews (
 id varchar(36) PRIMARY KEY,
 tenant_id uuid NOT NULL, account_id uuid NOT NULL,
 source varchar(20) NOT NULL CHECK(source IN ('personal','collab')),
 source_id text NOT NULL, context_id text NOT NULL, source_version text NOT NULL,
 kind varchar(24) NOT NULL, title text NOT NULL, reason text NOT NULL,
 proposal text NOT NULL, impact text NOT NULL DEFAULT '',
 status varchar(24) NOT NULL DEFAULT 'pending',
 decision text, edited_content text, comment text,
 execution_status varchar(24) NOT NULL DEFAULT 'not_started', execution_error text,
 created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,account_id,source,source_id,source_version)
);
CREATE INDEX IF NOT EXISTS human_reviews_inbox ON human_reviews(tenant_id,account_id,status,created_at DESC);

-- Department governance phase 2 (additive)
CREATE TABLE IF NOT EXISTS rx_governance_settings (
 tenant_id varchar(36) PRIMARY KEY, enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS rx_departments (
 id varchar(36) PRIMARY KEY, tenant_id varchar(36) NOT NULL,
 name varchar(100) NOT NULL, parent_id varchar(36),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS rx_department_members (
 tenant_id varchar(36) NOT NULL, department_id varchar(36) NOT NULL,
 account_id varchar(36) NOT NULL, PRIMARY KEY(tenant_id,department_id,account_id)
);
CREATE INDEX IF NOT EXISTS rx_member_departments ON rx_department_members(tenant_id,account_id);
CREATE TABLE IF NOT EXISTS rx_admin_roles (
 tenant_id varchar(36) NOT NULL, id varchar(36) NOT NULL, name varchar(100) NOT NULL,
 permissions jsonb NOT NULL DEFAULT '[]', preset boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS rx_admin_assignments (
 tenant_id varchar(36) NOT NULL, account_id varchar(36) NOT NULL,
 role_id varchar(36) NOT NULL, department_ids jsonb NOT NULL DEFAULT '[]',
 granted_by varchar(36) NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,account_id)
);
CREATE TABLE IF NOT EXISTS rx_resource_departments (
 tenant_id varchar(36) NOT NULL, kind varchar(16) NOT NULL,
 resource_id varchar(36) NOT NULL, department_id varchar(36) NOT NULL,
 PRIMARY KEY(tenant_id,kind,resource_id,department_id)
);
CREATE TABLE IF NOT EXISTS rx_releases (
 id varchar(36) PRIMARY KEY, tenant_id varchar(36) NOT NULL,
 applicant_id varchar(36) NOT NULL, kind varchar(16) NOT NULL,
 resource_id varchar(36) NOT NULL, resource_name varchar(255) NOT NULL,
 action varchar(16) NOT NULL CHECK(action IN ('publish','share')),
 department_id varchar(36), visibility varchar(16) NOT NULL,
 department_ids jsonb NOT NULL DEFAULT '[]', fingerprint varchar(64) NOT NULL,
 summary jsonb NOT NULL DEFAULT '{}', note text NOT NULL DEFAULT '',
 state varchar(24) NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','returned','rejected','withdrawn','failed','stale')),
 reviewer_id varchar(36), comment text NOT NULL DEFAULT '', result jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS rx_one_pending_release ON rx_releases(tenant_id,kind,resource_id) WHERE state='pending';
CREATE INDEX IF NOT EXISTS rx_releases_applicant ON rx_releases(tenant_id,applicant_id,created_at);
CREATE TABLE IF NOT EXISTS rx_governance_audit (
 id bigserial PRIMARY KEY, tenant_id varchar(36) NOT NULL, actor_id varchar(36) NOT NULL,
 action varchar(100) NOT NULL, object_id varchar(100) NOT NULL,
 department_id varchar(36), result varchar(16) NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rx_governance_audit_scope ON rx_governance_audit(tenant_id,department_id,created_at);
