-- Order prepaid amount (amount already paid online / at counter)
ALTER TABLE `orders` ADD COLUMN `prepaidAmount` INT NOT NULL DEFAULT 0;

UPDATE `orders` SET `prepaidAmount` = `total` WHERE `paymentStatus` = 'PAID';

-- Wallet addon payments for order item additions after online pay
ALTER TABLE `wallet_transactions` MODIFY COLUMN `type` ENUM(
  'ORDER_PAYMENT',
  'ORDER_ADDON_PAYMENT',
  'REFUND',
  'PAYOUT',
  'ADJUSTMENT'
) NOT NULL;

-- Allow one ORDER_PAYMENT and one ORDER_ADDON_PAYMENT per order
ALTER TABLE `wallet_transactions` DROP INDEX `wallet_transactions_orderId_key`;
CREATE UNIQUE INDEX `wallet_tx_order_type` ON `wallet_transactions` (`orderId`, `type`);
