-- SUPERSEDED by packages/db/prisma/migrations/20260725190000_driver_profile_duty_status
-- Kept for reference. Do not run against DBs that already have the Prisma migration.
-- Note: this older script also tried to ADD phone (now owned by 20260725120000).

-- Driver profile fields, duty status, and job broadcast tracking

ALTER TABLE `admin_users`
  ADD COLUMN `phone` VARCHAR(191) NULL,
  ADD COLUMN `nicNumber` VARCHAR(191) NULL,
  ADD COLUMN `vehicleNumber` VARCHAR(191) NULL,
  ADD COLUMN `profilePhotoUrl` VARCHAR(191) NULL,
  ADD COLUMN `licenseImageUrl` VARCHAR(191) NULL,
  ADD COLUMN `dutyStatus` ENUM('ONLINE', 'ON_DELIVERY', 'OFF_DUTY') NOT NULL DEFAULT 'OFF_DUTY';

ALTER TABLE `delivery_jobs`
  ADD COLUMN `broadcastedAt` DATETIME(3) NULL;
