ALTER TABLE `admin_users` ADD COLUMN `pinLookup` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `admin_users_storeId_pinLookup_key` ON `admin_users` (`storeId`, `pinLookup`);
