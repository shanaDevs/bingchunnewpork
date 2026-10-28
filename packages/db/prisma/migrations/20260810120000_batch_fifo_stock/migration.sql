-- Batch-based FIFO stock system

-- Store code for batch number prefixes
ALTER TABLE `stores` ADD COLUMN `code` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `stores_code_key` ON `stores`(`code`);

-- Order channel (online vs counter)
ALTER TABLE `orders` ADD COLUMN `channel` ENUM('ONLINE', 'COUNTER') NOT NULL DEFAULT 'ONLINE';

-- Store product batch fields
ALTER TABLE `store_products`
  ADD COLUMN `weeklyTargetQty` INT NOT NULL DEFAULT 0,
  ADD COLUMN `lowStockThreshold` INT NULL,
  ADD COLUMN `onlineOutOfStockThreshold` INT NULL;

ALTER TABLE `store_products` DROP COLUMN `weekResetAt`;

-- Extend stock audit change types
ALTER TABLE `stock_audit_logs`
  MODIFY COLUMN `changeType` ENUM(
    'ORDER_DEDUCTION',
    'ORDER_RESTORATION',
    'MANUAL_ADJUSTMENT',
    'WEEKLY_RESET',
    'BATCH_RECEIVED',
    'BATCH_ADJUSTMENT',
    'WASTAGE',
    'EXPIRY_WRITE_OFF'
  ) NOT NULL;

ALTER TABLE `stock_audit_logs` ADD COLUMN `batchId` VARCHAR(191) NULL;
CREATE INDEX `stock_audit_logs_batchId_idx` ON `stock_audit_logs`(`batchId`);

-- Stock batches
CREATE TABLE `stock_batches` (
  `id` VARCHAR(191) NOT NULL,
  `batchNumber` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `receivedQty` INT NOT NULL,
  `remainingQty` INT NOT NULL,
  `receivedAt` DATETIME(3) NOT NULL,
  `unitCost` INT NULL,
  `expiryDate` DATETIME(3) NULL,
  `status` ENUM('ACTIVE', 'DEPLETED', 'WRITTEN_OFF') NOT NULL DEFAULT 'ACTIVE',
  `note` TEXT NULL,
  `createdByAdminId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `stock_batches_storeId_batchNumber_key`(`storeId`, `batchNumber`),
  INDEX `stock_batches_storeId_productId_status_receivedAt_idx`(`storeId`, `productId`, `status`, `receivedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stock_batch_allocations` (
  `id` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `orderItemId` VARCHAR(191) NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `quantity` INT NOT NULL,
  `reversedQty` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `stock_batch_allocations_orderId_idx`(`orderId`),
  INDEX `stock_batch_allocations_batchId_idx`(`batchId`),
  INDEX `stock_batch_allocations_storeId_productId_idx`(`storeId`, `productId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stock_batch_counters` (
  `storeId` VARCHAR(191) NOT NULL,
  `dateKey` VARCHAR(191) NOT NULL,
  `lastSeq` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`storeId`, `dateKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `weekly_stock_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `weekStart` DATETIME(3) NOT NULL,
  `weekEnd` DATETIME(3) NOT NULL,
  `targetQty` INT NOT NULL DEFAULT 0,
  `receivedQty` INT NOT NULL DEFAULT 0,
  `soldQty` INT NOT NULL DEFAULT 0,
  `wastageQty` INT NOT NULL DEFAULT 0,
  `openingQty` INT NOT NULL DEFAULT 0,
  `closingQty` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `weekly_stock_snapshots_storeId_productId_weekStart_key`(`storeId`, `productId`, `weekStart`),
  INDEX `weekly_stock_snapshots_storeId_weekStart_idx`(`storeId`, `weekStart`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `stock_batches`
  ADD CONSTRAINT `stock_batches_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `stock_batches_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `stock_batches_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `stock_batch_allocations`
  ADD CONSTRAINT `stock_batch_allocations_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `stock_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `stock_batch_allocations_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `stock_batch_allocations_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `order_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `stock_batch_counters`
  ADD CONSTRAINT `stock_batch_counters_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `weekly_stock_snapshots`
  ADD CONSTRAINT `weekly_stock_snapshots_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `weekly_stock_snapshots_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `stock_audit_logs`
  ADD CONSTRAINT `stock_audit_logs_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `stock_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
