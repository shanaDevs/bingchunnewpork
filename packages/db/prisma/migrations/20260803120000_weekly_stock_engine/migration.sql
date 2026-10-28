-- Weekly stock engine: extend store_products and add stock_audit_logs

ALTER TABLE `store_products`
  ADD COLUMN IF NOT EXISTS `weeklyBaseQty` INT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS `weeklyRemainingQty` INT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS `weekResetAt` DATETIME(3) NULL;

CREATE TABLE IF NOT EXISTS `stock_audit_logs` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `changeType` ENUM('ORDER_DEDUCTION', 'ORDER_RESTORATION', 'MANUAL_ADJUSTMENT', 'WEEKLY_RESET') NOT NULL,
  `qtyBefore` INT NOT NULL,
  `qtyChange` INT NOT NULL,
  `qtyAfter` INT NOT NULL,
  `orderId` VARCHAR(191) NULL,
  `adminUserId` VARCHAR(191) NULL,
  `note` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `stock_audit_logs_storeId_productId_idx` (`storeId`, `productId`),
  INDEX `stock_audit_logs_createdAt_idx` (`createdAt`),
  INDEX `stock_audit_logs_changeType_idx` (`changeType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
