-- DueCase: eccezioni alle permanenze per singolo figlio.
CREATE TABLE IF NOT EXISTS custody_exceptions (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  custody_date DATE NOT NULL,
  custodian_role TEXT NOT NULL CHECK (custodian_role IN ('father','mother')),
  overnight BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custody_exceptions_family_date
  ON custody_exceptions(family_id, custody_date, child_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custody_exceptions_one_pending
  ON custody_exceptions(family_id, child_id, custody_date)
  WHERE status = 'pending';
