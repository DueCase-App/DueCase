ALTER TABLE users
  ADD COLUMN IF NOT EXISTS privacy_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT;

CREATE INDEX IF NOT EXISTS idx_users_terms_accepted_at ON users (terms_accepted_at);
