-- DueCase: cleanup definitivo dei vincoli legacy che interferiscono con la registrazione moderna.
-- Idempotente e sicuro su database nuovi e migrati dalla vecchia app Due-case.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'users'
       AND column_name = 'name'
  ) THEN
    -- Manteniamo coerenti i record storici, poi lasciamo che display_name sia il campo canonico.
    EXECUTE 'UPDATE users SET name = COALESCE(name, display_name) WHERE name IS NULL';
    EXECUTE 'ALTER TABLE users ALTER COLUMN name DROP NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'children'
       AND column_name = 'name'
  ) THEN
    -- La vecchia tabella children usava name NOT NULL; oggi il campo canonico è display_name.
    EXECUTE 'UPDATE children SET name = COALESCE(name, display_name, ''Figlio/a'') WHERE name IS NULL';
    EXECUTE 'ALTER TABLE children ALTER COLUMN name DROP NOT NULL';
  END IF;
END $$;
