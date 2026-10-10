-- DueCase growth analytics foundation.
-- Stores only product/growth events and intentionally excludes message text,
-- documents, receipts and child profile data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS growth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT UNIQUE,
  event_name TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  source TEXT,
  campaign TEXT,
  platform TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_events_event_name_check CHECK (event_name ~ '^[a-z0-9_]{2,80}$'),
  CONSTRAINT growth_events_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_growth_events_name_created_at
  ON growth_events(event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_growth_events_family_created_at
  ON growth_events(family_id, created_at DESC)
  WHERE family_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_growth_events_user_created_at
  ON growth_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_growth_events_source_campaign_created_at
  ON growth_events(source, campaign, created_at DESC)
  WHERE source IS NOT NULL OR campaign IS NOT NULL;
