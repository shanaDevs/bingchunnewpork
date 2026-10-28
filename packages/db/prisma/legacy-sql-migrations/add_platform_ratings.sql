-- Platform-wide customer ratings (one per completed order)
CREATE TABLE `platform_ratings` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `stars` INT NOT NULL,
  `comment` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `platform_ratings_orderId_key` (`orderId`),
  INDEX `platform_ratings_createdAt_idx` (`createdAt`),
  INDEX `platform_ratings_stars_idx` (`stars`),
  CONSTRAINT `platform_ratings_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `platform_ratings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
