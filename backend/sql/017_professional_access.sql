-- DueCase: accesso professionisti separato dagli account genitore.
-- Gli account professionali non appartengono alla famiglia e non possono assumere ruoli padre/madre.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS professional_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  organization TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_professional_users_email_lower
  ON professional_users(LOWER(email))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS professional_invitations (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  invite_email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT professional_invitations_scopes_check CHECK (
    scopes <@ ARRAY['calendar','expenses','agreements','documents','dossier','messages']::TEXT[]
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_professional_invitations_token_hash
  ON professional_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_professional_invitations_family
  ON professional_invitations(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_professional_invitations_email
  ON professional_invitations(LOWER(invite_email), expires_at DESC);

CREATE TABLE IF NOT EXISTS professional_access_grants (
  id UUID PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES professional_users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  granted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT professional_access_grants_scopes_check CHECK (
    scopes <@ ARRAY['calendar','expenses','agreements','documents','dossier','messages']::TEXT[]
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_professional_access_unique_active
  ON professional_access_grants(professional_id, family_id, granted_by_user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_professional_access_professional
  ON professional_access_grants(professional_id, revoked_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_professional_access_family
  ON professional_access_grants(family_id, revoked_at, created_at DESC);

CREATE TABLE IF NOT EXISTS professional_access_audit (
  id UUID PRIMARY KEY,
  professional_id UUID REFERENCES professional_users(id) ON DELETE SET NULL,
  grant_id UUID REFERENCES professional_access_grants(id) ON DELETE SET NULL,
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  actor_parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT professional_access_audit_action_check CHECK (
    action IN ('invited','invitation_resent','invitation_revoked','invitation_accepted','access_scopes_updated','access_revoked','professional_view','professional_export')
  )
);

CREATE INDEX IF NOT EXISTS idx_professional_access_audit_family
  ON professional_access_audit(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_professional_access_audit_professional
  ON professional_access_audit(professional_id, created_at DESC);

CREATE OR REPLACE FUNCTION duecase_professional_audit_append_only_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'DueCase professional access audit is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_professional_access_audit_append_only ON professional_access_audit;
CREATE TRIGGER trg_professional_access_audit_append_only
BEFORE UPDATE OR DELETE ON professional_access_audit
FOR EACH ROW
EXECUTE FUNCTION duecase_professional_audit_append_only_guard();
