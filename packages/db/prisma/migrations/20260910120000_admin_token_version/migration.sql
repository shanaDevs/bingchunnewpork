-- ROLE-005: invalidate admin refresh tokens after password change or deactivation
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
