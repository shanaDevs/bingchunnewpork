-- Rider profiles (delivery schema) + optional DB role for delivery-service.
CREATE TABLE IF NOT EXISTS delivery."rider_profiles" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "pinLookup" TEXT,
  "phone" TEXT,
  "vehicleType" TEXT,
  "vehicleNumber" TEXT,
  "vehicleColor" TEXT,
  "licenseNumber" TEXT,
  "disabilities" TEXT,
  "profilePhotoUrl" TEXT,
  "licenseImageUrl" TEXT,
  "dutyStatus" public."DriverDutyStatus" NOT NULL DEFAULT 'OFF_DUTY',
  "meritPoints" INTEGER NOT NULL DEFAULT 100,
  "consecutiveSuccessfulDeliveries" INTEGER NOT NULL DEFAULT 0,
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rider_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rider_profiles_adminUserId_key" ON delivery."rider_profiles" ("adminUserId");
CREATE INDEX IF NOT EXISTS "rider_profiles_pinLookup_idx" ON delivery."rider_profiles" ("pinLookup");

-- Run manually in production with a strong password (not applied automatically):
-- CREATE ROLE delivery_svc LOGIN PASSWORD '...';
-- GRANT USAGE ON SCHEMA delivery TO delivery_svc;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA delivery TO delivery_svc;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA delivery TO delivery_svc;
-- GRANT USAGE ON SCHEMA public TO delivery_svc;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO delivery_svc;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA delivery GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO delivery_svc;
