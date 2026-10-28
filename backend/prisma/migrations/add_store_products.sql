-- Branch inventory: every product at every store with stock count
CREATE TABLE IF NOT EXISTS `store_products` (
  `storeId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `stock` INT NOT NULL DEFAULT 50,
  `isAvailable` BOOLEAN NOT NULL DEFAULT true,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`storeId`, `productId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `store_products` (`storeId`, `productId`, `stock`, `isAvailable`)
SELECT s.id, p.id, 50, true
FROM `stores` s
CROSS JOIN `products` p
WHERE s.isActive = true AND p.isAvailable = true
ON DUPLICATE KEY UPDATE `storeId` = `storeId`;
