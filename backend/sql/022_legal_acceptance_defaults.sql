ALTER TABLE users
  ALTER COLUMN privacy_acknowledged_at SET DEFAULT NOW(),
  ALTER COLUMN privacy_policy_version SET DEFAULT '2026-10-07',
  ALTER COLUMN terms_accepted_at SET DEFAULT NOW(),
  ALTER COLUMN terms_version SET DEFAULT '2026-10-07';
