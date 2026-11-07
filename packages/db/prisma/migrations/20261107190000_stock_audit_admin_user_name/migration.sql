-- Snapshot the acting admin/cashier name on stock audit rows.
ALTER TABLE "stock_audit_logs" ADD COLUMN IF NOT EXISTS "adminUserName" TEXT;

UPDATE "stock_audit_logs" AS sal
SET "adminUserName" = au.name
FROM "admin_users" AS au
WHERE sal."adminUserId" = au.id
  AND sal."adminUserName" IS NULL;
