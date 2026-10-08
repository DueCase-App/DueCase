-- Final data-minimisation cleanup: DueCase no longer collects or exposes the Italian tax code.
DROP INDEX IF EXISTS idx_users_tax_code_upper;
ALTER TABLE users DROP COLUMN IF EXISTS tax_code;
