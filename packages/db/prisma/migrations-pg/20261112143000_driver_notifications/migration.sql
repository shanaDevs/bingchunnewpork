-- Rider inbox for admin actions on complaints and branch change requests

CREATE TABLE IF NOT EXISTS "delivery"."driver_notifications" (
  "id" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'ACCOUNT_UPDATE',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "complaintId" TEXT,
  "branchRequestId" TEXT,
  "orderId" TEXT,
  "orderNumber" TEXT,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "driver_notifications_driverId_read_idx"
  ON "delivery"."driver_notifications"("driverId", "read");

CREATE INDEX IF NOT EXISTS "driver_notifications_driverId_createdAt_idx"
  ON "delivery"."driver_notifications"("driverId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'driver_notifications_driverId_fkey'
  ) THEN
    ALTER TABLE "delivery"."driver_notifications"
      ADD CONSTRAINT "driver_notifications_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES "public"."admin_users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
