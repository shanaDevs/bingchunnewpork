-- Record which branch staff member first processed an order, and who
-- performed each subsequent status / counter action.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "processedByAdminId" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "processedByName" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);

ALTER TABLE "order_status_events" ADD COLUMN IF NOT EXISTS "actorAdminId" TEXT;
ALTER TABLE "order_status_events" ADD COLUMN IF NOT EXISTS "actorName" TEXT;
ALTER TABLE "order_status_events" ADD COLUMN IF NOT EXISTS "actorRole" TEXT;

CREATE INDEX IF NOT EXISTS "orders_storeId_processedByAdminId_createdAt_idx"
  ON "orders"("storeId", "processedByAdminId", "createdAt");

CREATE INDEX IF NOT EXISTS "order_status_events_actorAdminId_idx"
  ON "order_status_events"("actorAdminId");

DO $$ BEGIN
  ALTER TABLE "orders"
    ADD CONSTRAINT "orders_processedByAdminId_fkey"
    FOREIGN KEY ("processedByAdminId") REFERENCES "admin_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_status_events"
    ADD CONSTRAINT "order_status_events_actorAdminId_fkey"
    FOREIGN KEY ("actorAdminId") REFERENCES "admin_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
