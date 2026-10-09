-- Support safe filtering of inactive family members.
-- Existing users remain active because NULL means not deactivated.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_family_active_role
  ON users(family_id, role)
  WHERE deactivated_at IS NULL;
