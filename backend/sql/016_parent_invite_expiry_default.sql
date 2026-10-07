-- Ensure newly-created families always receive a valid legacy/invitation expiry.
ALTER TABLE families ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
ALTER TABLE families ALTER COLUMN invite_expires_at SET DEFAULT (NOW() + INTERVAL '7 days');
UPDATE families
   SET invite_expires_at = NOW() + INTERVAL '7 days'
 WHERE invite_expires_at IS NULL;
