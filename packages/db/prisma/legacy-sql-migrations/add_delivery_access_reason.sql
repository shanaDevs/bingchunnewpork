-- Add optional reason field to delivery access audit log
ALTER TABLE `delivery_access_logs`
  ADD COLUMN `reason` VARCHAR(191) NULL AFTER `changedByName`;
