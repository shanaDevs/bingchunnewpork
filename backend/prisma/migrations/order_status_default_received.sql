-- New orders should start as RECEIVED (store accepts, then moves to PREPARING).
ALTER TABLE `orders`
  MODIFY `status` ENUM(
    'RECEIVED',
    'PREPARING',
    'READY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED'
  ) NOT NULL DEFAULT 'RECEIVED';
