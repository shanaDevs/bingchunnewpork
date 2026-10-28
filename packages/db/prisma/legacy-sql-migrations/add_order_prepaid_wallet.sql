-- Wallet addon payments (skip if already applied)
ALTER TABLE `wallet_transactions` MODIFY COLUMN `type` ENUM(
  'ORDER_PAYMENT',
  'ORDER_ADDON_PAYMENT',
  'REFUND',
  'PAYOUT',
  'ADJUSTMENT'
) NOT NULL;

-- Drop old unique on orderId if present, add composite unique
-- MySQL: ignore errors if index already changed
DROP INDEX `wallet_transactions_orderId_key` ON `wallet_transactions`;
CREATE UNIQUE INDEX `wallet_tx_order_type` ON `wallet_transactions` (`orderId`, `type`);
