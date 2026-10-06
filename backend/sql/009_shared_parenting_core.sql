-- DueCase: modello condiviso completo per figli, permanenze, accordi, spese e storico.
-- Idempotente e compatibile con lo schema legacy.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Scheda figlio estesa.
ALTER TABLE children ADD COLUMN IF NOT EXISTS school TEXT;
ALTER TABLE children ADD COLUMN IF NOT EXISTS class_name TEXT;
ALTER TABLE children ADD COLUMN IF NOT EXISTS sports TEXT;
ALTER TABLE children ADD COLUMN IF NOT EXISTS extracurricular TEXT;
ALTER TABLE children ADD COLUMN IF NOT EXISTS useful_info TEXT;
ALTER TABLE children ADD COLUMN IF NOT EXISTS authorizations TEXT;
ALTER TABLE children ADD COLUMN IF NOT EXISTS shared_notes TEXT;
ALTER TABLE children ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Schema settimanale ordinario delle permanenze. Un record per figlio/giorno.
CREATE TABLE IF NOT EXISTS custody_weekly_patterns (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  custodian_role TEXT NOT NULL CHECK (custodian_role IN ('father', 'mother')),
  overnight BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (family_id, child_id, weekday)
);
CREATE INDEX IF NOT EXISTS idx_custody_weekly_patterns_family_child
  ON custody_weekly_patterns(family_id, child_id, weekday);

-- Eventi condivisi più ricchi.
ALTER TABLE family_events ADD COLUMN IF NOT EXISTS child_id UUID REFERENCES children(id) ON DELETE SET NULL;
ALTER TABLE family_events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'other';
ALTER TABLE family_events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE family_events ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE family_events ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE family_events ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE family_events ADD COLUMN IF NOT EXISTS response_note TEXT;
ALTER TABLE family_events DROP CONSTRAINT IF EXISTS family_events_status_check;
ALTER TABLE family_events ADD CONSTRAINT family_events_status_check
  CHECK (status IN ('pending', 'confirmed', 'rejected')) NOT VALID;
ALTER TABLE family_events DROP CONSTRAINT IF EXISTS family_events_type_check;
ALTER TABLE family_events ADD CONSTRAINT family_events_type_check
  CHECK (event_type IN ('custody','overnight','holiday','vacation','school','sport','medical','birthday','appointment','personal','other')) NOT VALID;

-- Accordi tra Mamma e Papà, separati da eventuali tabelle legacy chiamate agreements.
CREATE TABLE IF NOT EXISTS family_agreements (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN ('calendar','vacation','expense','school','sport','medical','organization','other')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','changes_requested')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  response_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_agreements_family_status
  ON family_agreements(family_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS family_agreement_history (
  id UUID PRIMARY KEY,
  agreement_id UUID NOT NULL REFERENCES family_agreements(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  actor_user_id UUID,
  action TEXT NOT NULL CHECK (action IN ('created','approved','rejected','changes_requested','updated')),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_family_agreement_history_agreement
  ON family_agreement_history(agreement_id, created_at);

CREATE OR REPLACE FUNCTION duecase_agreement_history_append_only_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DueCase agreement history is append-only' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS trg_family_agreement_history_append_only ON family_agreement_history;
CREATE TRIGGER trg_family_agreement_history_append_only
BEFORE UPDATE OR DELETE ON family_agreement_history
FOR EACH ROW EXECUTE FUNCTION duecase_agreement_history_append_only_guard();

-- Spese: percentuali libere e stati completi.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS father_percentage NUMERIC(5,2) NOT NULL DEFAULT 50.00;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS mother_percentage NUMERIC(5,2) NOT NULL DEFAULT 50.00;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('draft','submitted','pending_approval','approved','declined','disputed','to_pay','partially_paid','paid','closed')) NOT VALID;

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_percentage_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_percentage_check
  CHECK (
    father_percentage >= 0 AND father_percentage <= 100 AND
    mother_percentage >= 0 AND mother_percentage <= 100 AND
    ROUND((father_percentage + mother_percentage)::numeric, 2) = 100.00
  ) NOT VALID;

CREATE TABLE IF NOT EXISTS expense_children (
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  PRIMARY KEY (expense_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_expense_children_family_child ON expense_children(family_id, child_id);

CREATE TABLE IF NOT EXISTS expense_payments (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  paid_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'declared' CHECK (status IN ('declared','confirmed','rejected')),
  paid_at TIMESTAMPTZ NOT NULL,
  receipt_filename TEXT,
  receipt_mime_type TEXT,
  receipt_data BYTEA,
  notes TEXT,
  confirmed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expense_payments_expense_created
  ON expense_payments(expense_id, created_at DESC);

-- Registro generale append-only per operazioni rilevanti.
CREATE TABLE IF NOT EXISTS family_activity_history (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL,
  actor_user_id UUID,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_family_activity_history_family_created
  ON family_activity_history(family_id, created_at DESC);

CREATE OR REPLACE FUNCTION duecase_family_activity_append_only_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DueCase family activity history is append-only' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS trg_family_activity_history_append_only ON family_activity_history;
CREATE TRIGGER trg_family_activity_history_append_only
BEFORE UPDATE OR DELETE ON family_activity_history
FOR EACH ROW EXECUTE FUNCTION duecase_family_activity_append_only_guard();

-- Notifiche consultabili anche dentro l'app.
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_created
  ON in_app_notifications(user_id, read_at, created_at DESC);
