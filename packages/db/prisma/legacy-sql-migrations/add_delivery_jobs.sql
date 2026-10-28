CREATE TABLE IF NOT EXISTS `delivery_jobs` (
  `id` VARCHAR(191) NOT NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `driverId` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `status` ENUM('SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  `scheduledAt` DATETIME(3) NOT NULL,
  `assignedAt` DATETIME(3) NULL,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `delivery_jobs_storeId_status_idx` (`storeId`, `status`),
  INDEX `delivery_jobs_driverId_status_idx` (`driverId`, `status`),
  CONSTRAINT `delivery_jobs_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `delivery_jobs_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `delivery_job_orders` (
  `jobId` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `sequence` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`jobId`, `orderId`),
  CONSTRAINT `delivery_job_orders_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `delivery_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `delivery_job_orders_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
