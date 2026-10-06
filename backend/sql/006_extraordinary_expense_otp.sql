-- DueCase: firma OTP per approvazione delle spese straordinarie.
-- Idempotente: eseguita automaticamente all'avvio del backend.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS is_extraordinary BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS otp_signature_metadata JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'otp_request_status') THEN
    CREATE TYPE otp_request_status AS ENUM ('pending', 'verified', 'expired');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS otp_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  code_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status otp_request_status NOT NULL DEFAULT 'pending',
  attempts SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  CONSTRAINT otp_requests_code_hash_sha256 CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT otp_requests_attempts_non_negative CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_otp_requests_expense_user_created
  ON otp_requests(expense_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_otp_requests_pending_expiry
  ON otp_requests(expires_at)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_requests_one_pending
  ON otp_requests(expense_id, user_id)
  WHERE status = 'pending';
