-- Add platform column to orders (0 = WEB, 1 = MOBILE_APP)
ALTER TABLE `orders` ADD COLUMN `platform` INT NOT NULL DEFAULT 0;
