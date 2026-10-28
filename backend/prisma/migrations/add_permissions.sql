-- Create permissions table (was in schema but never applied to DB)
CREATE TABLE IF NOT EXISTS `permissions` (
  `id` VARCHAR(191) NOT NULL,
  `adminUserId` VARCHAR(191) NOT NULL,
  `menu` VARCHAR(191) NOT NULL,
  `canCreate` BOOLEAN NOT NULL DEFAULT false,
  `canRead` BOOLEAN NOT NULL DEFAULT false,
  `canUpdate` BOOLEAN NOT NULL DEFAULT false,
  `canDelete` BOOLEAN NOT NULL DEFAULT false,
  UNIQUE INDEX `permissions_adminUserId_menu_key`(`adminUserId`, `menu`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add FK only if missing (safe to re-run if constraint already exists may fail — handle separately)
ALTER TABLE `permissions`
  ADD CONSTRAINT `permissions_adminUserId_fkey`
  FOREIGN KEY (`adminUserId`) REFERENCES `admin_users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
