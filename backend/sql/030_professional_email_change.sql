-- Professional email-change verification.
ALTER TABLE professional_email_challenges
  DROP CONSTRAINT IF EXISTS professional_email_challenges_purpose_check;
ALTER TABLE professional_email_challenges
  ADD CONSTRAINT professional_email_challenges_purpose_check
  CHECK (purpose IN ('reset','email_change'));
ALTER TABLE professional_email_challenges
  ADD COLUMN IF NOT EXISTS target_email TEXT;
CREATE INDEX IF NOT EXISTS idx_professional_email_challenges_target
  ON professional_email_challenges(LOWER(target_email), created_at DESC)
  WHERE target_email IS NOT NULL;
