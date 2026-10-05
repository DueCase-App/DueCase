-- DueCase: eventi familiari + firma OTP per approvazione spese.
-- Idempotente: eseguita automaticamente all'avvio del backend.

CREATE TABLE IF NOT EXISTS family_events (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  location VARCHAR(240),
  notes TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT family_events_valid_interval CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_family_events_family_starts_at
  ON family_events(family_id, starts_at);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_otp_hash TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_otp_expires_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_otp_requested_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_otp_attempts SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_otp_verified_at TIMESTAMPTZ;
