-- Inventory reservation system (physical stock holds during checkout)
-- stock column is NOT modified until payment succeeds.

CREATE TABLE `store_product_reservations` (
  `id` VARCHAR(191) NOT NULL,
  `reservationUuid` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `cartId` VARCHAR(191) NULL,
  `storeId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `quantity` INT NOT NULL,
  `orderId` VARCHAR(191) NULL,
  `status` ENUM('ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `idx_reservation_uuid` (`reservationUuid`),
  INDEX `idx_reservation_store_product_status` (`storeId`, `productId`, `status`),
  INDEX `idx_reservation_status_expires` (`status`, `expiresAt`),
  INDEX `idx_reservation_user_status` (`userId`, `status`),
  INDEX `idx_reservation_order` (`orderId`),
  CONSTRAINT `store_product_reservations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `store_product_reservations_cartId_fkey` FOREIGN KEY (`cartId`) REFERENCES `carts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `store_product_reservations_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `store_product_reservations_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `store_product_reservations_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
