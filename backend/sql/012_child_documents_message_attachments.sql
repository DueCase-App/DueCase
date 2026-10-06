-- DueCase: associazioni documenti-figli e allegati chat append-only.
-- Usiamo nomi dedicati DueCase per evitare collisioni con tabelle legacy.

CREATE TABLE IF NOT EXISTS duecase_document_children (
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_duecase_document_children_family_child
  ON duecase_document_children(family_id, child_id);

CREATE TABLE IF NOT EXISTS duecase_message_attachments (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL,
  family_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes >= 0),
  file_data BYTEA NOT NULL,
  data_hash VARCHAR(64) NOT NULL CHECK (data_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_duecase_message_attachments_message
  ON duecase_message_attachments(family_id, message_id, created_at);

CREATE OR REPLACE FUNCTION duecase_message_attachments_append_only_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'DueCase message attachments are append-only'
    USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS trg_duecase_message_attachments_append_only ON duecase_message_attachments;
CREATE TRIGGER trg_duecase_message_attachments_append_only
BEFORE UPDATE OR DELETE ON duecase_message_attachments
FOR EACH ROW
EXECUTE FUNCTION duecase_message_attachments_append_only_guard();
