-- Branch-specific online ordering window and pickup cutoff before close
ALTER TABLE `stores` ADD COLUMN `onlineOrderStartTime` VARCHAR(191) NULL;
ALTER TABLE `stores` ADD COLUMN `onlineOrderStopTime` VARCHAR(191) NULL;
ALTER TABLE `stores` ADD COLUMN `pickupCutoffMinutes` INT NOT NULL DEFAULT 50;
