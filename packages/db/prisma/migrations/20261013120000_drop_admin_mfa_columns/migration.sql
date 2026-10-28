-- AlterTable
ALTER TABLE "admin_users" DROP COLUMN IF EXISTS "mfaEnabled",
DROP COLUMN IF EXISTS "mfaSecret";
