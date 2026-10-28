-- Driver profile fields, duty status, and job broadcast tracking (cashierBase).
-- Does NOT re-add admin_users.phone (already in 20260725120000_delivery_service_extensions).

ALTER TABLE `admin_users`
  ADD COLUMN `nicNumber` VARCHAR(191) NULL,
  ADD COLUMN `vehicleNumber` VARCHAR(191) NULL,
  ADD COLUMN `profilePhotoUrl` VARCHAR(191) NULL,
  ADD COLUMN `licenseImageUrl` VARCHAR(191) NULL,
  ADD COLUMN `dutyStatus` ENUM('ONLINE', 'ON_DELIVERY', 'OFF_DUTY') NOT NULL DEFAULT 'OFF_DUTY';

ALTER TABLE `delivery_jobs`
  ADD COLUMN `broadcastedAt` DATETIME(3) NULL;
