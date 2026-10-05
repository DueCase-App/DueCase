-- Base schema + authentication/family onboarding.
-- This file is intentionally idempotent because Render runs it at startup.

CREATE TABLE IF NOT EXISTS families (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade databases created with the previous schema.
ALTER TABLE families ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- Backfill an invite code only for legacy rows that predate authentication.
UPDATE families
   SET invite_code = UPPER(SUBSTRING(MD5(id::text || RANDOM()::text || CLOCK_TIMESTAMP()::text), 1, 10))
 WHERE invite_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_families_invite_code
  ON families(invite_code);

ALTER TABLE families ALTER COLUMN invite_code SET NOT NULL;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('father', 'mother')),
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
  ON users(LOWER(email));

-- A family can contain at most one father and one mother.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_family_role
  ON users(family_id, role)
  WHERE family_id IS NOT NULL;

-- Domain parent profiles are kept for compatibility with the existing
-- calendar/expense schema. Authenticated users get a parent row with the
-- same UUID when they create or join a family.
CREATE TABLE IF NOT EXISTS parents (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('father', 'mother', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS children (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  birth_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custody_turns (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
  child_id UUID REFERENCES children(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_custody_turns_family_dates
  ON custody_turns(family_id, starts_at, ends_at);

-- Daily custody calendar fields. They stay nullable so legacy interval rows remain valid.
ALTER TABLE custody_turns ADD COLUMN IF NOT EXISTS custody_date DATE;
ALTER TABLE custody_turns ADD COLUMN IF NOT EXISTS custodian_role TEXT;
ALTER TABLE custody_turns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'custody_turns_custodian_role_check'
  ) THEN
    ALTER TABLE custody_turns
      ADD CONSTRAINT custody_turns_custodian_role_check
      CHECK (custodian_role IS NULL OR custodian_role IN ('father', 'mother'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_custody_turns_family_day
  ON custody_turns(family_id, custody_date)
  WHERE custody_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_custody_turns_family_custodian
  ON custody_turns(family_id, custodian_role, custody_date)
  WHERE custody_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS swap_requests (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_date DATE NOT NULL,
  proposed_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (target_date <> proposed_date)
);

CREATE INDEX IF NOT EXISTS idx_swap_requests_family_status
  ON swap_requests(family_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_swap_requests_unique_pending
  ON swap_requests(family_id, requested_by, target_date, proposed_date)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL CHECK (category IN ('Scuola', 'Salute', 'Sport', 'Svago')),
  paid_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  receipt_url TEXT,
  receipt_mime_type TEXT,
  receipt_filename TEXT,
  receipt_data BYTEA,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'declined')),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Legacy columns kept nullable so old installations can migrate in place.
  paid_by_parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
  total_cents INTEGER,
  payer_share_cents INTEGER,
  other_share_cents INTEGER
);

-- Upgrade databases created by earlier DueCase revisions without losing history.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_mime_type TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_filename TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_data BYTEA;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Legacy revisions stored money as integer cents. Convert once into exact NUMERIC(12,2).
UPDATE expenses
   SET amount = ROUND(total_cents::numeric / 100, 2)
 WHERE amount IS NULL
   AND total_cents IS NOT NULL;

-- Authenticated users and parent profiles deliberately share the same UUID.
UPDATE expenses e
   SET paid_by_user_id = e.paid_by_parent_id
 WHERE e.paid_by_user_id IS NULL
   AND e.paid_by_parent_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM users u WHERE u.id = e.paid_by_parent_id);

-- Replace the old pending/paid/rejected state model with approval states.
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
UPDATE expenses SET status = 'pending_approval' WHERE status = 'pending';
UPDATE expenses SET status = 'declined' WHERE status = 'rejected';
UPDATE expenses SET status = 'approved' WHERE status = 'paid';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_status_check') THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_status_check
      CHECK (status IN ('pending_approval', 'approved', 'declined')) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_category_check') THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_category_check
      CHECK (category IN ('Scuola', 'Salute', 'Sport', 'Svago')) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_amount_positive_check') THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_amount_positive_check
      CHECK (amount > 0) NOT VALID;
  END IF;
END $$;

-- Enforce required values for every new/updated expense while preserving any
-- incomplete legacy rows that predate the authenticated expense model.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_amount_required_check') THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_amount_required_check
      CHECK (amount IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_payer_required_check') THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_payer_required_check
      CHECK (paid_by_user_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- Old share columns are retained only for backwards-compatible data migration.
-- New writes use the exact amount column and derive the 50/50 balance dynamically.
ALTER TABLE expenses ALTER COLUMN total_cents DROP NOT NULL;
ALTER TABLE expenses ALTER COLUMN payer_share_cents DROP NOT NULL;
ALTER TABLE expenses ALTER COLUMN other_share_cents DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_family_date
  ON expenses(family_id, expense_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_family_status
  ON expenses(family_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Altro'
    CHECK (category IN ('Salute', 'Scuola', 'Legale', 'Altro')),
  file_url TEXT NOT NULL,
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  mime_type TEXT,
  filename TEXT,
  file_size_bytes INTEGER,
  file_data BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Legacy field retained only for in-place upgrades from older revisions.
  notes TEXT
);

-- Upgrade databases created by earlier DueCase revisions without losing metadata.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS filename TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Preserve legacy descriptions that were previously stored in notes.
UPDATE documents
   SET description = notes
 WHERE description IS NULL
   AND notes IS NOT NULL;

-- Normalize legacy free-form categories to the protected archive categories.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_category_check;
UPDATE documents
   SET category = CASE LOWER(category)
     WHEN 'salute' THEN 'Salute'
     WHEN 'health' THEN 'Salute'
     WHEN 'scuola' THEN 'Scuola'
     WHEN 'school' THEN 'Scuola'
     WHEN 'legale' THEN 'Legale'
     WHEN 'legal' THEN 'Legale'
     ELSE 'Altro'
   END;
ALTER TABLE documents ALTER COLUMN category SET DEFAULT 'Altro';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_category_check') THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_category_check
      CHECK (category IN ('Salute', 'Scuola', 'Legale', 'Altro')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_family_created
  ON documents(family_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_family_category
  ON documents(family_id, category, created_at DESC);
