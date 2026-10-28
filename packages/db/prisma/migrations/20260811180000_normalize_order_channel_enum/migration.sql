-- Normalize legacy orders.channel ENUM('ONLINE','COUNTER') → WEB/APP/POS/WHATSAPP/TELEGRAM

ALTER TABLE `orders` MODIFY `channel` VARCHAR(32) NOT NULL DEFAULT 'WEB';

UPDATE `orders` SET `channel` = 'WEB' WHERE `channel` IN ('ONLINE', 'online', '') OR `channel` IS NULL;
UPDATE `orders` SET `channel` = 'POS' WHERE `channel` IN ('COUNTER', 'counter');
UPDATE `orders` SET `channel` = 'APP' WHERE `platform` = 1 AND `channel` = 'WEB';

ALTER TABLE `orders`
  MODIFY `channel` ENUM('WEB', 'APP', 'POS', 'WHATSAPP', 'TELEGRAM') NOT NULL DEFAULT 'WEB';
