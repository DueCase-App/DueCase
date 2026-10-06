-- DueCase: weekend alternati per singolo figlio.
-- La regola e' bisettimanale e viene applicata a sabato/domenica prima dello schema settimanale ordinario.

CREATE TABLE IF NOT EXISTS custody_alternating_weekends (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  anchor_saturday DATE NOT NULL,
  first_weekend_role TEXT NOT NULL CHECK (first_weekend_role IN ('father', 'mother')),
  second_weekend_role TEXT NOT NULL CHECK (second_weekend_role IN ('father', 'mother')),
  overnight BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (family_id, child_id),
  CONSTRAINT custody_alternating_weekends_anchor_saturday_check
    CHECK (EXTRACT(ISODOW FROM anchor_saturday) = 6)
);

CREATE INDEX IF NOT EXISTS idx_custody_alternating_weekends_family
  ON custody_alternating_weekends(family_id, child_id);
