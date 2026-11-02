-- Global newest-first order lists (super admin, reports) and guest order lookup by phone.
-- On a very large live table prefer running these two statements manually with
-- CREATE INDEX CONCURRENTLY (cannot run inside a migration transaction), then deploy.
CREATE INDEX IF NOT EXISTS "orders_createdAt_idx" ON "public"."orders"("createdAt");
CREATE INDEX IF NOT EXISTS "orders_guestPhone_createdAt_idx" ON "public"."orders"("guestPhone", "createdAt");
