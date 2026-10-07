-- DueCase canonical schema + safe upgrades from the legacy Due-case database.
-- Intentionally idempotent: Render executes this file on every service start.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS families (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE families ADD COLUMN IF NOT EXISTS invite_code TEXT;

UPDATE families
   SET invite_code = UPPER(SUBSTRING(MD5(id::text || RANDOM()::text || CLOCK_TIMESTAMP()::text), 1, 10))
 WHERE invite_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_families_invite_code
  ON families(invite_code);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM families WHERE invite_code IS NULL) THEN
    ALTER TABLE families ALTER COLUMN invite_code SET NOT NULL;
  END IF;
END $$;

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

-- Legacy Due-case used users(name, email, password_hash) and family_members.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES families(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
  ) THEN
    EXECUTE 'UPDATE users SET display_name = name WHERE display_name IS NULL';
  END IF;
END $$;

UPDATE users
   SET display_name = COALESCE(display_name, NULLIF(email, ''), 'Genitore')
 WHERE display_name IS NULL;

DO $$
BEGIN
  IF to_regclass('public.family_members') IS NOT NULL THEN
    EXECUTE $legacy$
      WITH ranked AS (
        SELECT fm.user_id,
               fm.family_id,
               ROW_NUMBER() OVER (
                 PARTITION BY fm.family_id
                 ORDER BY COALESCE(u.created_at, NOW()), u.id
               ) AS rn
          FROM family_members fm
          JOIN users u ON u.id = fm.user_id
      )
      UPDATE users u
         SET family_id = r.family_id,
             role = CASE
                      WHEN r.rn = 1 THEN 'father'
                      WHEN r.rn = 2 THEN 'mother'
                      ELSE u.role
                    END,
             updated_at = NOW()
        FROM ranked r
       WHERE u.id = r.user_id
         AND r.rn <= 2
         AND (u.family_id IS NULL OR u.role IS NULL)
    $legacy$;
  END IF;
END $$;

-- Complete any partially migrated users without rewriting already valid roles.
WITH ranked AS (
  SELECT id,
         family_id,
         ROW_NUMBER() OVER (PARTITION BY family_id ORDER BY created_at, id) AS rn
    FROM users
   WHERE family_id IS NOT NULL
)
UPDATE users u
   SET role = CASE WHEN r.rn = 1 THEN 'father' WHEN r.rn = 2 THEN 'mother' ELSE u.role END,
       updated_at = NOW()
  FROM ranked r
 WHERE u.id = r.id
   AND u.role IS NULL
   AND r.rn <= 2;

UPDATE users
   SET role = 'father', updated_at = NOW()
 WHERE role IS NULL
   AND family_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IS NULL OR role IN ('father', 'mother')) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE display_name IS NULL) THEN
    ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE role IS NULL) THEN
    ALTER TABLE users ALTER COLUMN role SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
  ON users(LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_family_role
  ON users(family_id, role)
  WHERE family_id IS NOT NULL AND role IN ('father', 'mother');

CREATE TABLE IF NOT EXISTS parents (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('father', 'mother', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auth users and parent profiles share the same UUID.
INSERT INTO parents (id, family_id, display_name, role, created_at)
SELECT id, family_id, display_name, role, created_at
  FROM users
 WHERE family_id IS NOT NULL
   AND display_name IS NOT NULL
   AND role IN ('father', 'mother')
ON CONFLICT (id) DO UPDATE
SET family_id = EXCLUDED.family_id,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role;

CREATE TABLE IF NOT EXISTS children (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  birth_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE children ADD COLUMN IF NOT EXISTS display_name TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'children' AND column_name = 'name'
  ) THEN
    EXECUTE 'UPDATE children SET display_name = name WHERE display_name IS NULL';
  END IF;
END $$;

UPDATE children SET display_name = 'Figlio/a' WHERE display_name IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM children WHERE display_name IS NULL) THEN
    ALTER TABLE children ALTER COLUMN display_name SET NOT NULL;
  END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_custody_turns_family_dates
  ON custody_turns(family_id, starts_at, ends_at);

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
    CHECK (status IN ('draft','submitted','pending_approval','approved','declined','disputed','to_pay','partially_paid','paid','closed')),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_by_parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
  total_cents INTEGER,
  payer_share_cents INTEGER,
  other_share_cents INTEGER
);

-- Upgrade both the old Due-case expense table and earlier DueCase revisions.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_mime_type TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_filename TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_data BYTEA;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_date DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_by_parent_id UUID REFERENCES parents(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS total_cents INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payer_share_cents INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS other_share_cents INTEGER;

ALTER TABLE expenses ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::NUMERIC(12,2);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'created_by'
  ) THEN
    EXECUTE 'UPDATE expenses SET paid_by_user_id = created_by WHERE paid_by_user_id IS NULL AND created_by IS NOT NULL';
  END IF;
END $$;

UPDATE expenses
   SET amount = ROUND(total_cents::numeric / 100, 2)
 WHERE amount IS NULL
   AND total_cents IS NOT NULL;

UPDATE expenses e
   SET paid_by_user_id = e.paid_by_parent_id
 WHERE e.paid_by_user_id IS NULL
   AND e.paid_by_parent_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM users u WHERE u.id = e.paid_by_parent_id);

UPDATE expenses
   SET expense_date = COALESCE(expense_date, created_at::date, CURRENT_DATE)
 WHERE expense_date IS NULL;

ALTER TABLE expenses ALTER COLUMN expense_date SET DEFAULT CURRENT_DATE;
ALTER TABLE expenses ALTER COLUMN status SET DEFAULT 'pending_approval';

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

UPDATE expenses SET status = 'pending_approval' WHERE status IN ('pending', 'declared');
UPDATE expenses SET status = 'declined' WHERE status = 'rejected';
-- paid is a current workflow state; never downgrade existing reimbursements.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_status_check') THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_status_check
      CHECK (status IN ('draft','submitted','pending_approval','approved','declined','disputed','to_pay','partially_paid','paid','closed')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_category_check') THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_category_check
      CHECK (category IS NULL OR category IN ('Scuola', 'Salute', 'Sport', 'Svago')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_amount_positive_check') THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_amount_positive_check
      CHECK (amount > 0) NOT VALID;
  END IF;
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
  notes TEXT
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Altro';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS filename TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE documents
   SET description = notes
 WHERE description IS NULL
   AND notes IS NOT NULL;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_category_check;
UPDATE documents
   SET category = CASE LOWER(COALESCE(category, 'altro'))
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
