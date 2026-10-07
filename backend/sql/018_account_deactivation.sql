-- Preserve shared ledger references while removing the deleted account's credentials/profile.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
