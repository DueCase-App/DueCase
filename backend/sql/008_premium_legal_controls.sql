-- DueCase: controlli Premium, messaggi strettamente immutabili e cancellazione account privacy-safe.
-- Idempotente: viene eseguita automaticamente all'avvio del backend.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Abbonamento famiglia: 4,99 EUR/mese, nessun periodo di prova.
CREATE TABLE IF NOT EXISTS family_subscriptions (
  family_id UUID PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL DEFAULT 'premium_monthly',
  price_cents INTEGER NOT NULL DEFAULT 499,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  billing_period TEXT NOT NULL DEFAULT 'month',
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT family_subscriptions_plan_check CHECK (plan_code = 'premium_monthly'),
  CONSTRAINT family_subscriptions_price_check CHECK (price_cents = 499),
  CONSTRAINT family_subscriptions_currency_check CHECK (currency = 'EUR'),
  CONSTRAINT family_subscriptions_period_check CHECK (billing_period = 'month'),
  CONSTRAINT family_subscriptions_status_check CHECK (status IN ('inactive', 'active', 'past_due', 'canceled')),
  CONSTRAINT family_subscriptions_period_order_check CHECK (
    current_period_start IS NULL OR current_period_end IS NULL OR current_period_end > current_period_start
  )
);

INSERT INTO family_subscriptions (family_id)
SELECT id FROM families
ON CONFLICT (family_id) DO NOTHING;

CREATE OR REPLACE FUNCTION duecase_create_family_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO family_subscriptions (family_id)
  VALUES (NEW.id)
  ON CONFLICT (family_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_families_create_subscription ON families;
CREATE TRIGGER trg_families_create_subscription
AFTER INSERT ON families
FOR EACH ROW
EXECUTE FUNCTION duecase_create_family_subscription();

-- 2) Messaggi: l'hash usa text|sender_id|timestamp UTC. Dopo questa migrazione
-- nessun UPDATE o DELETE della riga messages e' consentito, neppure per read_at.
DROP TRIGGER IF EXISTS trg_messages_immutable_guard ON messages;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_role TEXT;

UPDATE messages m
   SET sender_role = u.role
  FROM users u
 WHERE m.sender_id = u.id
   AND m.sender_role IS NULL
   AND u.role IN ('father', 'mother');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_sender_role_check') THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_sender_role_check
      CHECK (sender_role IS NULL OR sender_role IN ('father', 'mother')) NOT VALID;
  END IF;
END $$;

-- Le FK verso users/families impedirebbero il diritto alla cancellazione dell'account
-- oppure tenterebbero CASCADE/SET NULL, che costituirebbe una modifica del record immutabile.
-- Conserviamo quindi gli UUID come riferimenti opachi non reversibili dopo la cancellazione account.
DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'messages'::regclass
       AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE messages DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

-- Le ricevute di lettura diventano record append-only separati: il messaggio resta intatto.
-- Nome dedicato per evitare collisioni con eventuali tabelle legacy chiamate message_reads.
CREATE TABLE IF NOT EXISTS message_read_receipts (
  message_id UUID NOT NULL,
  family_id UUID NOT NULL,
  reader_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (message_id, reader_id)
);

CREATE INDEX IF NOT EXISTS idx_message_read_receipts_family_message
  ON message_read_receipts(family_id, message_id, read_at);

-- Migra le vecchie read_at verso la tabella append-only quando e' possibile individuare l'altro genitore.
INSERT INTO message_read_receipts (message_id, family_id, reader_id, read_at)
SELECT m.id,
       m.family_id,
       other_parent.id,
       m.read_at
  FROM messages m
  JOIN LATERAL (
    SELECT u.id
      FROM users u
     WHERE u.family_id = m.family_id
       AND u.id <> m.sender_id
     ORDER BY u.created_at, u.id
     LIMIT 1
  ) AS other_parent ON TRUE
 WHERE m.read_at IS NOT NULL
ON CONFLICT (message_id, reader_id) DO NOTHING;

CREATE OR REPLACE FUNCTION duecase_messages_strict_immutable_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'DueCase legal messages are strictly immutable'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_immutable_guard ON messages;
CREATE TRIGGER trg_messages_immutable_guard
BEFORE UPDATE OR DELETE ON messages
FOR EACH ROW
EXECUTE FUNCTION duecase_messages_strict_immutable_guard();

CREATE OR REPLACE FUNCTION duecase_message_read_receipts_append_only_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'DueCase message read receipts are append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_message_read_receipts_append_only ON message_read_receipts;
CREATE TRIGGER trg_message_read_receipts_append_only
BEFORE UPDATE OR DELETE ON message_read_receipts
FOR EACH ROW
EXECUTE FUNCTION duecase_message_read_receipts_append_only_guard();

-- 3) Le esportazioni probatorie restano append-only ma non devono impedire
-- la cancellazione fisica dell'account o della famiglia. Gli UUID restano opachi.
DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'report_exports'::regclass
       AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE report_exports DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;
