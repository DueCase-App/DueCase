ALTER TABLE families ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ DEFAULT (NOW()+INTERVAL '7 days');
CREATE TABLE IF NOT EXISTS duecase_message_blocks (
 user_id UUID PRIMARY KEY REFERENCES users(id), family_id UUID NOT NULL REFERENCES families(id),
 blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS duecase_abuse_reports (
 id UUID PRIMARY KEY, family_id UUID NOT NULL REFERENCES families(id),
 reporter_id UUID NOT NULL REFERENCES users(id), message_id UUID NOT NULL,
 reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','reviewing','resolved')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_duecase_abuse_pending ON duecase_abuse_reports(status,created_at);
CREATE TABLE IF NOT EXISTS duecase_email_changes (
 user_id UUID PRIMARY KEY REFERENCES users(id), new_email TEXT NOT NULL, code_hash TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS duecase_sessions (
 id TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), token_version INTEGER NOT NULL,
 device_label TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_duecase_sessions_user ON duecase_sessions(user_id,expires_at);
