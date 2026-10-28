-- Add senderType and processingStartedAt to channel_messages
ALTER TABLE `channel_messages`
  ADD COLUMN `senderType` ENUM('CUSTOMER', 'BOT', 'ADMIN', 'SYSTEM') NOT NULL DEFAULT 'CUSTOMER' AFTER `direction`,
  ADD COLUMN `processingStartedAt` DATETIME(3) NULL AFTER `processed`;

-- Backfill senderType from direction + messageType
UPDATE `channel_messages`
SET `senderType` = 'ADMIN'
WHERE `direction` = 'OUTBOUND' AND `messageType` = 'admin';

UPDATE `channel_messages`
SET `senderType` = 'SYSTEM'
WHERE `direction` = 'OUTBOUND' AND `messageType` = 'status';

UPDATE `channel_messages`
SET `senderType` = 'SYSTEM'
WHERE `messageType` LIKE 'webhook_%' OR `externalMessageId` LIKE 'webhook:%';

UPDATE `channel_messages`
SET `senderType` = 'BOT'
WHERE `direction` = 'OUTBOUND' AND `senderType` = 'CUSTOMER';

UPDATE `channel_messages`
SET `senderType` = 'CUSTOMER'
WHERE `direction` = 'INBOUND' AND `senderType` = 'CUSTOMER';
