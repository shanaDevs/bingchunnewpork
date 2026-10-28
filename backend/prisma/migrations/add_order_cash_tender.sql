-- Cash tender at counter (for admin receipt change display)
ALTER TABLE `orders` ADD COLUMN `cashReceivedAmount` INT NULL;
ALTER TABLE `orders` ADD COLUMN `changeGivenAmount` INT NULL;
