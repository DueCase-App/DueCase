-- DueCase: profilo anagrafico esteso per la registrazione store-ready.
-- Idempotente: viene eseguito automaticamente all'avvio del backend.

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_code VARCHAR(16);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_other_parent BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE users
   SET tax_code = UPPER(REPLACE(tax_code, ' ', ''))
 WHERE tax_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tax_code_upper
  ON users(UPPER(tax_code))
  WHERE tax_code IS NOT NULL;
