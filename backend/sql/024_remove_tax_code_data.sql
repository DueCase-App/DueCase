-- DueCase no longer collects the Italian tax code during registration.
-- Keep the nullable legacy column temporarily for backwards-compatible code paths,
-- but remove any value already stored and any uniqueness requirement.

UPDATE users
   SET tax_code = NULL
 WHERE tax_code IS NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tax_code_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tax_code_unique;

CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));
