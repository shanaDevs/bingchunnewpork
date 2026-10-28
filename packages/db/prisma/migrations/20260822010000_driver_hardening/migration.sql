-- Driver hardening: QUEUED jobs, payment gateway, registration fields, merit, complaints, branch requests, rejections
-- Additive / non-destructive.

-- DeliveryJobStatus: add QUEUED
DO $$ BEGIN
  ALTER TYPE "DeliveryJobStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- PaymentGateway enum + Order.paymentGateway
DO $$ BEGIN
  CREATE TYPE "PaymentGateway" AS ENUM ('PAYHERE', 'WEBXPAY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paymentGateway" "PaymentGateway";

-- AdminUser driver profile / merit fields
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "vehicleType" TEXT;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "vehicleColor" TEXT;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "licenseNumber" TEXT;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "disabilities" TEXT;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "meritPoints" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "consecutiveSuccessfulDeliveries" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "admin_users_pinLookup_idx" ON "admin_users"("pinLookup");

-- DeliveryJob index
CREATE INDEX IF NOT EXISTS "delivery_jobs_storeId_status_scheduledAt_idx"
  ON "delivery_jobs"("storeId", "status", "scheduledAt");

-- Enums for new tables
DO $$ BEGIN
  CREATE TYPE "MeritEventType" AS ENUM (
    'INITIAL', 'LATE_DELIVERY', 'CANCEL_BEFORE_PICKUP',
    'CONFIRMED_COMPLAINT', 'SERIOUS_VIOLATION', 'RECOVERY_BONUS', 'MANUAL_ADJUSTMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MeritStatusBand" AS ENUM (
    'EXCELLENT', 'GOOD', 'AVERAGE', 'WARNING', 'CRITICAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DriverComplaintStatus" AS ENUM ('OPEN', 'CONFIRMED', 'DISMISSED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DriverBranchRequestType" AS ENUM ('ADD_BRANCH', 'CHANGE_BRANCH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DriverBranchRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "delivery_job_rejections" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "rejectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_job_rejections_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "delivery_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "delivery_job_rejections_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "delivery_job_rejections_jobId_rejectedAt_idx"
  ON "delivery_job_rejections"("jobId", "rejectedAt");
CREATE INDEX IF NOT EXISTS "delivery_job_rejections_driverId_rejectedAt_idx"
  ON "delivery_job_rejections"("driverId", "rejectedAt");

CREATE TABLE IF NOT EXISTS "driver_complaints" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "DriverComplaintStatus" NOT NULL DEFAULT 'OPEN',
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_complaints_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "driver_complaints_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "driver_complaints_orderId_idx" ON "driver_complaints"("orderId");
CREATE INDEX IF NOT EXISTS "driver_complaints_driverId_createdAt_idx"
  ON "driver_complaints"("driverId", "createdAt");
CREATE INDEX IF NOT EXISTS "driver_complaints_storeId_status_createdAt_idx"
  ON "driver_complaints"("storeId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "driver_branch_requests" (
  "id" TEXT PRIMARY KEY,
  "driverId" TEXT NOT NULL,
  "type" "DriverBranchRequestType" NOT NULL,
  "fromStoreId" TEXT,
  "toStoreId" TEXT NOT NULL,
  "reason" TEXT,
  "status" "DriverBranchRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_branch_requests_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "driver_branch_requests_driverId_status_idx"
  ON "driver_branch_requests"("driverId", "status");
CREATE INDEX IF NOT EXISTS "driver_branch_requests_status_createdAt_idx"
  ON "driver_branch_requests"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "merit_point_history" (
  "id" TEXT PRIMARY KEY,
  "driverId" TEXT NOT NULL,
  "orderId" TEXT,
  "previousPoints" INTEGER NOT NULL,
  "changedPoints" INTEGER NOT NULL,
  "newPoints" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "eventType" "MeritEventType" NOT NULL,
  "createdBy" TEXT NOT NULL DEFAULT 'SYSTEM',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merit_point_history_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "merit_point_history_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "merit_point_history_driverId_createdAt_idx"
  ON "merit_point_history"("driverId", "createdAt");
CREATE INDEX IF NOT EXISTS "merit_point_history_orderId_idx" ON "merit_point_history"("orderId");
CREATE INDEX IF NOT EXISTS "merit_point_history_eventType_createdAt_idx"
  ON "merit_point_history"("eventType", "createdAt");
