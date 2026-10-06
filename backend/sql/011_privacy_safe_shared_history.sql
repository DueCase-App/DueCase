-- DueCase: storico condiviso compatibile con cancellazione account.
-- Salva il ruolo al momento dell'operazione e rimuove FK verso users dagli archivi storici.

ALTER TABLE family_agreements ADD COLUMN IF NOT EXISTS created_by_role TEXT;
ALTER TABLE family_agreements ADD COLUMN IF NOT EXISTS reviewed_by_role TEXT;
UPDATE family_agreements a SET created_by_role = u.role FROM users u WHERE a.created_by = u.id AND a.created_by_role IS NULL;
UPDATE family_agreements a SET reviewed_by_role = u.role FROM users u WHERE a.reviewed_by = u.id AND a.reviewed_by_role IS NULL;

ALTER TABLE custody_exceptions ADD COLUMN IF NOT EXISTS requested_by_role TEXT;
ALTER TABLE custody_exceptions ADD COLUMN IF NOT EXISTS reviewed_by_role TEXT;
UPDATE custody_exceptions e SET requested_by_role = u.role FROM users u WHERE e.requested_by = u.id AND e.requested_by_role IS NULL;
UPDATE custody_exceptions e SET reviewed_by_role = u.role FROM users u WHERE e.reviewed_by = u.id AND e.reviewed_by_role IS NULL;

ALTER TABLE expense_payments ADD COLUMN IF NOT EXISTS paid_by_role TEXT;
ALTER TABLE expense_payments ADD COLUMN IF NOT EXISTS confirmed_by_role TEXT;
UPDATE expense_payments p SET paid_by_role = u.role FROM users u WHERE p.paid_by_user_id = u.id AND p.paid_by_role IS NULL;
UPDATE expense_payments p SET confirmed_by_role = u.role FROM users u WHERE p.confirmed_by_user_id = u.id AND p.confirmed_by_role IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS table_name
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = 'users'::regclass
       AND c.conrelid IN ('family_agreements'::regclass, 'custody_exceptions'::regclass, 'expense_payments'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.table_name, r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'family_agreements_created_role_check') THEN
    ALTER TABLE family_agreements ADD CONSTRAINT family_agreements_created_role_check CHECK (created_by_role IS NULL OR created_by_role IN ('father','mother')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custody_exceptions_requested_role_check') THEN
    ALTER TABLE custody_exceptions ADD CONSTRAINT custody_exceptions_requested_role_check CHECK (requested_by_role IS NULL OR requested_by_role IN ('father','mother')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_payments_paid_role_check') THEN
    ALTER TABLE expense_payments ADD CONSTRAINT expense_payments_paid_role_check CHECK (paid_by_role IS NULL OR paid_by_role IN ('father','mother')) NOT VALID;
  END IF;
END $$;
