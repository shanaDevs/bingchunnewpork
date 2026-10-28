-- Extend store_wallets with cached earnings/withdrawn totals
ALTER TABLE `store_wallets`
  ADD COLUMN `totalEarnings` INT NOT NULL DEFAULT 0 AFTER `balance`,
  ADD COLUMN `totalWithdrawn` INT NOT NULL DEFAULT 0 AFTER `totalEarnings`;

-- Branch withdrawal request / approval ledger
CREATE TABLE IF NOT EXISTS `store_withdrawals` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `amount` INT NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `remarks` TEXT NULL,
  `rejectionReason` TEXT NULL,
  `requestedById` VARCHAR(191) NOT NULL,
  `reviewedById` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `walletTransactionId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `store_withdrawals_walletTransactionId_key` (`walletTransactionId`),
  INDEX `store_withdrawals_storeId_createdAt_idx` (`storeId`, `createdAt`),
  INDEX `store_withdrawals_storeId_status_idx` (`storeId`, `status`),
  CONSTRAINT `store_withdrawals_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `store_withdrawals_walletTransactionId_fkey` FOREIGN KEY (`walletTransactionId`) REFERENCES `wallet_transactions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Payment details recorded when super admin approves a payout
ALTER TABLE `store_withdrawals`
  ADD COLUMN `paymentMethod` ENUM('BANK_TRANSFER', 'CASH') NULL AFTER `rejectionReason`,
  ADD COLUMN `proofUrl` VARCHAR(191) NULL AFTER `paymentMethod`,
  ADD COLUMN `invoiceRef` VARCHAR(191) NULL AFTER `proofUrl`,
  ADD COLUMN `invoiceUrl` VARCHAR(191) NULL AFTER `invoiceRef`;
