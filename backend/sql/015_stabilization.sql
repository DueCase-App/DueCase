-- New messages may contain an attachment without text.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_text_length_check;
ALTER TABLE messages ADD CONSTRAINT messages_text_length_check CHECK (char_length(text) BETWEEN 0 AND 10000) NOT VALID;
-- Legacy installations used body/content as required columns. New API uses text.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND table_schema='public' AND column_name='body') THEN
    ALTER TABLE messages ALTER COLUMN body DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND table_schema='public' AND column_name='content') THEN
    ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;
  END IF;
END $$;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_retry ON messages(sender_id, client_request_id) WHERE client_request_id IS NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS email_challenges (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')), code_hash TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_challenge_user ON email_challenges(user_id,purpose,created_at DESC);
