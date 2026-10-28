-- Delivery service extensions (Milestone 2)
-- Additive only: safe on existing production databases.

ALTER TABLE `admin_users` ADD COLUMN `phone` VARCHAR(191) NULL;

ALTER TABLE `stores` ADD COLUMN `deliveryOtpRequired` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `orders_storeId_status_orderMode_idx` ON `orders`(`storeId`, `status`, `orderMode`);

-- CreateTable
CREATE TABLE `driver_locations` (
    `id` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `accuracyM` DOUBLE NULL,
    `speedKph` DOUBLE NULL,
    `heading` DOUBLE NULL,
    `batteryPct` INTEGER NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `driver_locations_driverId_recordedAt_idx`(`driverId`, `recordedAt`),
    INDEX `driver_locations_jobId_recordedAt_idx`(`jobId`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `driver_shifts` (
    `id` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `driver_shifts_driverId_startedAt_idx`(`driverId`, `startedAt`),
    INDEX `driver_shifts_storeId_startedAt_idx`(`storeId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `driver_devices` (
    `id` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NULL,
    `fcmToken` TEXT NULL,
    `refreshTokenHash` TEXT NULL,
    `approvedAt` DATETIME(3) NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `driver_devices_deviceId_idx`(`deviceId`),
    UNIQUE INDEX `driver_devices_driverId_deviceId_key`(`driverId`, `deviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `attemptNo` INTEGER NOT NULL DEFAULT 1,
    `outcome` ENUM('DELIVERED', 'CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'REFUSED', 'PAYMENT_FAILED', 'OTHER') NOT NULL,
    `note` TEXT NULL,
    `photoUrl` VARCHAR(191) NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `delivery_attempts_orderId_createdAt_idx`(`orderId`, `createdAt`),
    INDEX `delivery_attempts_jobId_idx`(`jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_otps` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `delivery_otps_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_events` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NULL,
    `driverId` VARCHAR(191) NULL,
    `state` ENUM('PENDING_ASSIGNMENT', 'ASSIGNED', 'PICKED_UP', 'EN_ROUTE', 'ARRIVED', 'AWAITING_OTP', 'DELIVERED', 'FAILED', 'RETURNED_TO_STORE') NOT NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `delivery_events_orderId_createdAt_idx`(`orderId`, `createdAt`),
    INDEX `delivery_events_jobId_createdAt_idx`(`jobId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_outbox` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextRetryAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deliveredAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `delivery_outbox_idempotencyKey_key`(`idempotencyKey`),
    INDEX `delivery_outbox_deliveredAt_nextRetryAt_idx`(`deliveredAt`, `nextRetryAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `driver_locations` ADD CONSTRAINT `driver_locations_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_shifts` ADD CONSTRAINT `driver_shifts_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_devices` ADD CONSTRAINT `driver_devices_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_attempts` ADD CONSTRAINT `delivery_attempts_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_attempts` ADD CONSTRAINT `delivery_attempts_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_otps` ADD CONSTRAINT `delivery_otps_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_events` ADD CONSTRAINT `delivery_events_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
