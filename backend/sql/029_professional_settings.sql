-- Professional profile and portal settings.
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS qualification TEXT;
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS professional_register TEXT;
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS notify_activity BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS notify_documents BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS notify_access_changes BOOLEAN NOT NULL DEFAULT TRUE;
