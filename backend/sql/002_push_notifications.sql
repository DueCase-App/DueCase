-- Push notifications: one active Expo token per authenticated parent account.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS expo_push_token VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_users_family_push_token
  ON users(family_id)
  WHERE expo_push_token IS NOT NULL;
