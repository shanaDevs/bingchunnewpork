-- Promotion card design, criteria, and ordering fields
ALTER TABLE `promo_codes`
  ADD COLUMN `title` VARCHAR(191) NULL,
  ADD COLUMN `criteria` JSON NULL,
  ADD COLUMN `ownership` VARCHAR(191) NULL,
  ADD COLUMN `cardDesign` JSON NULL,
  ADD COLUMN `sortOrder` INT NOT NULL DEFAULT 0;
