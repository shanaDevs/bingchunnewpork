-- AlterTable
ALTER TABLE `users` ADD COLUMN `referredByUserId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `users_referredByUserId_idx` ON `users`(`referredByUserId`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_referredByUserId_fkey` FOREIGN KEY (`referredByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
