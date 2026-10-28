-- WhatsApp / Telegram unified ordering: channel on orders + identity + conversation + idempotency

ALTER TABLE `orders`
  ADD COLUMN `channel` ENUM('WEB', 'APP', 'POS', 'WHATSAPP', 'TELEGRAM') NOT NULL DEFAULT 'WEB';

UPDATE `orders` SET `channel` = 'APP' WHERE `platform` = 1;

CREATE INDEX `orders_channel_createdAt_idx` ON `orders`(`channel`, `createdAt`);

CREATE TABLE `customer_channels` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `channel` ENUM('WHATSAPP', 'TELEGRAM') NOT NULL,
    `externalUserId` VARCHAR(191) NOT NULL,
    `phoneNumber` VARCHAR(191) NULL,
    `username` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `customer_channels_channel_externalUserId_key`(`channel`, `externalUserId`),
    INDEX `customer_channels_customerId_idx`(`customerId`),
    INDEX `customer_channels_phoneNumber_idx`(`phoneNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `customer_channels`
  ADD CONSTRAINT `customer_channels_customerId_fkey`
  FOREIGN KEY (`customerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `conversation_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `channel` ENUM('WHATSAPP', 'TELEGRAM') NOT NULL,
    `externalUserId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `storeId` VARCHAR(191) NULL,
    `state` ENUM(
      'NEW',
      'SELECTING_STORE',
      'BROWSING_PRODUCTS',
      'SELECTING_PRODUCT',
      'ADDING_PRODUCT',
      'VIEWING_CART',
      'CHECKOUT',
      'COLLECTING_CUSTOMER_DETAILS',
      'SELECTING_PAYMENT',
      'CONFIRMING_ORDER',
      'ORDER_CREATED',
      'TRACKING_ORDER'
    ) NOT NULL DEFAULT 'NEW',
    `cartJson` JSON NOT NULL,
    `contextJson` JSON NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `conversation_sessions_channel_externalUserId_key`(`channel`, `externalUserId`),
    INDEX `conversation_sessions_state_expiresAt_idx`(`state`, `expiresAt`),
    INDEX `conversation_sessions_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `conversation_sessions`
  ADD CONSTRAINT `conversation_sessions_customerId_fkey`
  FOREIGN KEY (`customerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `conversation_sessions`
  ADD CONSTRAINT `conversation_sessions_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `channel_messages` (
    `id` VARCHAR(191) NOT NULL,
    `channel` ENUM('WHATSAPP', 'TELEGRAM') NOT NULL,
    `externalMessageId` VARCHAR(191) NOT NULL,
    `externalUserId` VARCHAR(191) NOT NULL,
    `direction` ENUM('INBOUND', 'OUTBOUND') NOT NULL,
    `messageType` VARCHAR(191) NOT NULL DEFAULT 'text',
    `payload` JSON NULL,
    `bodyText` TEXT NULL,
    `orderId` VARCHAR(191) NULL,
    `processed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `channel_messages_channel_externalMessageId_key`(`channel`, `externalMessageId`),
    INDEX `channel_messages_channel_externalUserId_createdAt_idx`(`channel`, `externalUserId`, `createdAt`),
    INDEX `channel_messages_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `channel_messages`
  ADD CONSTRAINT `channel_messages_orderId_fkey`
  FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
