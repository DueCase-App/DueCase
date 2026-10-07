-- DueCase: invito dell'altro genitore tramite email.
-- Mantiene compatibile il codice famiglia esistente e aggiunge lo stato dell'invito email.

ALTER TABLE families ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
ALTER TABLE families ADD COLUMN IF NOT EXISTS invite_email TEXT;
ALTER TABLE families ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;

UPDATE families
   SET invite_expires_at = COALESCE(invite_expires_at, NOW() + INTERVAL '7 days')
 WHERE invite_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_families_invite_email_lower
  ON families (LOWER(invite_email))
  WHERE invite_email IS NOT NULL;
