-- Platform earnings ledger + monthly settlement close-out (MySQL)

CREATE TABLE IF NOT EXISTS `platform_earnings` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `storeWithdrawalId` VARCHAR(191) NOT NULL,
  `periodFrom` DATETIME(3) NULL,
  `periodTo` DATETIME(3) NULL,
  `calendarMonth` VARCHAR(191) NOT NULL,
  `commissionAmount` INT NOT NULL,
  `convenienceFeeAmount` INT NOT NULL,
  `totalEarned` INT NOT NULL,
  `breakdown` JSON NOT NULL,
  `approvedAt` DATETIME(3) NOT NULL,
  `settlementId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `platform_earnings_storeWithdrawalId_key` (`storeWithdrawalId`),
  INDEX `platform_earnings_calendarMonth_idx` (`calendarMonth`),
  INDEX `platform_earnings_storeId_calendarMonth_idx` (`storeId`, `calendarMonth`),
  INDEX `platform_earnings_settlementId_idx` (`settlementId`),
  CONSTRAINT `platform_earnings_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `platform_earnings_storeWithdrawalId_fkey` FOREIGN KEY (`storeWithdrawalId`) REFERENCES `store_withdrawals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `platform_monthly_settlements` (
  `id` VARCHAR(191) NOT NULL,
  `calendarMonth` VARCHAR(191) NOT NULL,
  `totalCommission` INT NOT NULL,
  `totalConvenienceFee` INT NOT NULL,
  `totalEarned` INT NOT NULL,
  `status` ENUM('OPEN', 'SETTLED') NOT NULL DEFAULT 'OPEN',
  `settledAt` DATETIME(3) NULL,
  `settledByAdminId` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `platform_monthly_settlements_calendarMonth_key` (`calendarMonth`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FK from platform_earnings.settlementId added after settlements table exists
ALTER TABLE `platform_earnings`
  ADD CONSTRAINT `platform_earnings_settlementId_fkey`
  FOREIGN KEY (`settlementId`) REFERENCES `platform_monthly_settlements`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
