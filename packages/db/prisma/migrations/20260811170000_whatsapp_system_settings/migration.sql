-- WhatsApp Business Cloud API credentials on system_settings (admin Settings UI)

ALTER TABLE `system_settings`
  ADD COLUMN `whatsappEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `whatsappAccessToken` TEXT NULL,
  ADD COLUMN `whatsappPhoneNumberId` VARCHAR(191) NULL,
  ADD COLUMN `whatsappBusinessAccountId` VARCHAR(191) NULL,
  ADD COLUMN `whatsappVerifyToken` VARCHAR(191) NULL;
