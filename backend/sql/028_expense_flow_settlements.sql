-- DueCase: flusso spese definitivo, contestazione pagamento e regolazione saldo netto.

ALTER TABLE expense_payments
  ADD COLUMN IF NOT EXISTS rejected_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE TABLE IF NOT EXISTS family_settlements (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  paid_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  received_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'declared' CHECK (status IN ('declared','confirmed','rejected')),
  paid_at TIMESTAMPTZ NOT NULL,
  receipt_filename TEXT,
  receipt_mime_type TEXT,
  receipt_data BYTEA,
  notes TEXT,
  confirmed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  rejected_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  allocation_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (paid_by_user_id <> received_by_user_id)
);

CREATE INDEX IF NOT EXISTS idx_family_settlements_family_created
  ON family_settlements(family_id, created_at DESC);

ALTER TABLE expense_payments
  ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES family_settlements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expense_payments_settlement
  ON expense_payments(settlement_id)
  WHERE settlement_id IS NOT NULL;
