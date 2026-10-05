-- DueCase: messaggistica immutabile e registro esportazioni probatorie.
-- Idempotente: viene eseguita automaticamente all'avvio del backend.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  read_at TIMESTAMPTZ,
  data_hash VARCHAR(64) NOT NULL
);

-- Compatibilità con eventuali tabelle legacy già presenti.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS family_id UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT clock_timestamp();
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS data_hash VARCHAR(64);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'body'
  ) THEN
    EXECUTE 'UPDATE messages SET text = body WHERE text IS NULL AND body IS NOT NULL';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'content'
  ) THEN
    EXECUTE 'UPDATE messages SET text = content WHERE text IS NULL AND content IS NOT NULL';
  END IF;
END $$;

UPDATE messages
   SET created_at = clock_timestamp()
 WHERE created_at IS NULL;

-- Hash canonico V1: text|sender_id|UTC timestamp con millisecondi.
UPDATE messages
   SET data_hash = encode(
     digest(
       COALESCE(text, '') || '|' || COALESCE(sender_id::text, '') || '|' ||
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       'sha256'
     ),
     'hex'
   )
 WHERE data_hash IS NULL
    OR data_hash !~ '^[0-9a-f]{64}$';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_family_fk') THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_family_fk
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_sender_fk') THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_sender_fk
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_hash_format_check') THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_hash_format_check
      CHECK (data_hash ~ '^[0-9a-f]{64}$') NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_text_length_check') THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_text_length_check
      CHECK (char_length(text) BETWEEN 1 AND 10000) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_read_after_created_check') THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_read_after_created_check
      CHECK (read_at IS NULL OR read_at >= created_at) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM messages WHERE family_id IS NULL) THEN
    ALTER TABLE messages ALTER COLUMN family_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messages WHERE sender_id IS NULL) THEN
    ALTER TABLE messages ALTER COLUMN sender_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messages WHERE text IS NULL OR char_length(text) = 0) THEN
    ALTER TABLE messages ALTER COLUMN text SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messages WHERE created_at IS NULL) THEN
    ALTER TABLE messages ALTER COLUMN created_at SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messages WHERE data_hash IS NULL) THEN
    ALTER TABLE messages ALTER COLUMN data_hash SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_family_created
  ON messages(family_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_messages_family_unread
  ON messages(family_id, read_at, created_at)
  WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION duecase_messages_set_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at := clock_timestamp();
  END IF;

  NEW.data_hash := encode(
    digest(
      COALESCE(NEW.text, '') || '|' || COALESCE(NEW.sender_id::text, '') || '|' ||
      to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_set_hash ON messages;
CREATE TRIGGER trg_messages_set_hash
BEFORE INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION duecase_messages_set_hash();

-- Immutabilità: DELETE sempre vietato. UPDATE consentito esclusivamente una volta
-- per passare read_at da NULL al timestamp di prima lettura. Qualunque altro campo
-- (anche eventuali colonne legacy) non può cambiare.
CREATE OR REPLACE FUNCTION duecase_messages_immutable_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DueCase legal messages cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(NEW) - 'read_at') IS DISTINCT FROM (to_jsonb(OLD) - 'read_at') THEN
    RAISE EXCEPTION 'DueCase legal messages are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.read_at IS NOT NULL OR NEW.read_at IS NULL OR NEW.read_at < OLD.created_at THEN
    RAISE EXCEPTION 'read_at can only be recorded once after message creation'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_immutable_guard ON messages;
CREATE TRIGGER trg_messages_immutable_guard
BEFORE UPDATE OR DELETE ON messages
FOR EACH ROW
EXECUTE FUNCTION duecase_messages_immutable_guard();

CREATE TABLE IF NOT EXISTS report_exports (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
  generated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  generated_at TIMESTAMPTZ NOT NULL,
  report_hash VARCHAR(64) NOT NULL CHECK (report_hash ~ '^[0-9a-f]{64}$'),
  verification_string TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_report_exports_family_generated
  ON report_exports(family_id, generated_at DESC);

CREATE OR REPLACE FUNCTION duecase_append_only_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'DueCase audit records are append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_report_exports_append_only ON report_exports;
CREATE TRIGGER trg_report_exports_append_only
BEFORE UPDATE OR DELETE ON report_exports
FOR EACH ROW
EXECUTE FUNCTION duecase_append_only_guard();
