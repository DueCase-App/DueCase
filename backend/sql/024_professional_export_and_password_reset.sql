-- DueCase: audit exports from professional accounts and password recovery challenges.
-- Idempotent migration, executed automatically at backend startup.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- report_exports historically referenced only parent users. Professional exports are
-- already audited in professional_access_audit, but they must also be accepted by
-- the technical export registry without pretending the professional is a parent.
ALTER TABLE report_exports
  DROP CONSTRAINT IF EXISTS report_exports_generated_by_fkey;

ALTER TABLE report_exports
  ADD COLUMN IF NOT EXISTS generated_by_kind TEXT NOT NULL DEFAULT 'parent';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_exports_generated_by_kind_check'
  ) THEN
    ALTER TABLE report_exports
      ADD CONSTRAINT report_exports_generated_by_kind_check
      CHECK (generated_by_kind IN ('parent','professional')) NOT VALID;
  END IF;
END $$;

UPDATE report_exports
   SET generated_by_kind = 'parent'
 WHERE generated_by_kind IS NULL OR generated_by_kind NOT IN ('parent','professional');

CREATE OR REPLACE FUNCTION duecase_report_export_actor_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = NEW.generated_by) THEN
    NEW.generated_by_kind := 'parent';
  ELSIF EXISTS (SELECT 1 FROM professional_users WHERE id = NEW.generated_by AND deleted_at IS NULL) THEN
    NEW.generated_by_kind := 'professional';
  ELSE
    RAISE EXCEPTION 'Unknown DueCase export actor'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_report_exports_actor_guard ON report_exports;
CREATE TRIGGER trg_report_exports_actor_guard
BEFORE INSERT ON report_exports
FOR EACH ROW
EXECUTE FUNCTION duecase_report_export_actor_guard();

CREATE TABLE IF NOT EXISTS professional_email_challenges (
  id UUID PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES professional_users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('reset')),
  code_hash VARCHAR(64) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_professional_email_challenges_lookup
  ON professional_email_challenges(professional_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_professional_email_challenges_active
  ON professional_email_challenges(professional_id, expires_at DESC)
  WHERE consumed_at IS NULL;
