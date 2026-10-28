-- CreateEnum equivalent for BatchType
ALTER TABLE `stock_batches` ADD COLUMN `batchType` ENUM('NORMAL', 'EMERGENCY', 'RESET') NOT NULL DEFAULT 'NORMAL';
ALTER TABLE `stock_batches` ADD COLUMN `batchGroupId` VARCHAR(191) NULL;

CREATE TABLE `stock_batch_groups` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `batchNumber` VARCHAR(191) NOT NULL,
    `resetDate` DATETIME(3) NOT NULL,
    `note` TEXT NULL,
    `createdByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stock_batch_groups_storeId_resetDate_idx`(`storeId`, `resetDate`),
    UNIQUE INDEX `stock_batch_groups_storeId_batchNumber_key`(`storeId`, `batchNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `stock_batches_batchGroupId_idx` ON `stock_batches`(`batchGroupId`);

ALTER TABLE `stock_batches` ADD CONSTRAINT `stock_batches_batchGroupId_fkey` FOREIGN KEY (`batchGroupId`) REFERENCES `stock_batch_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `stock_batch_groups` ADD CONSTRAINT `stock_batch_groups_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `stock_batch_groups` ADD CONSTRAINT `stock_batch_groups_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
