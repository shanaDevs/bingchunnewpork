-- AlterTable
ALTER TABLE `admin_notifications` ADD COLUMN `productId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `admin_notifications_productId_idx` ON `admin_notifications`(`productId`);
