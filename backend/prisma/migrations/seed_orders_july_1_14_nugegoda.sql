-- =============================================================================
-- Nugegoda branch only — seed orders for 1–14 July 2026
-- 6 orders/day = 84 orders total (pickup + delivery, DELIVERED)
--
-- Run in HeidiSQL / MySQL on your bingchun database (F9)
-- Safe to re-run (ON DUPLICATE KEY UPDATE)
-- =============================================================================

SET NAMES utf8mb4;
SET @seed_year = 2026;
SET @seed_month = 7;
SET @orders_per_day = 6;

SELECT id INTO @nugegoda_store_id
FROM stores
WHERE isActive = 1 AND name LIKE '%Nugegoda%'
LIMIT 1;

SELECT COUNT(*) INTO @product_count FROM products WHERE isAvailable = 1;

SELECT IF(@nugegoda_store_id IS NOT NULL AND @product_count > 0, 1,
  (SELECT 1 FROM (SELECT 1) x WHERE 1 = 0)
);

DROP TEMPORARY TABLE IF EXISTS tmp_july_nugegoda;
CREATE TEMPORARY TABLE tmp_july_nugegoda (
  seq INT NOT NULL PRIMARY KEY,
  day_num TINYINT NOT NULL,
  slot INT NOT NULL,
  order_id VARCHAR(191) NOT NULL,
  order_number VARCHAR(191) NOT NULL,
  product_id VARCHAR(191) NOT NULL,
  product_name VARCHAR(191) NOT NULL,
  unit_price INT NOT NULL,
  quantity INT NOT NULL,
  subtotal INT NOT NULL,
  order_mode VARCHAR(20) NOT NULL,
  payment_method VARCHAR(30) NOT NULL,
  delivery_fee INT NOT NULL,
  convenient_fee INT NOT NULL,
  total INT NOT NULL,
  created_at DATETIME(3) NOT NULL
);

INSERT INTO tmp_july_nugegoda (
  seq, day_num, slot, order_id, order_number, product_id, product_name,
  unit_price, quantity, subtotal, order_mode, payment_method, delivery_fee,
  convenient_fee, total, created_at
)
SELECT
  g.seq,
  g.day_num,
  g.slot,
  CONCAT('seed-nuge-jul26-d', LPAD(g.day_num, 2, '0'), '-', LPAD(g.slot, 4, '0')),
  CONCAT(
    'BC',
    DATE_FORMAT(STR_TO_DATE(CONCAT(@seed_year, '-', @seed_month, '-', g.day_num), '%Y-%c-%e'), '%y%m%d'),
    '-N',
    LPAD(g.seq, 4, '0')
  ),
  p.id,
  p.name,
  p.basePrice,
  1 + (g.seq % 3),
  p.basePrice * (1 + (g.seq % 3)),
  IF(g.seq % 2 = 0, 'DELIVERY', 'TAKEAWAY'),
  CASE
    WHEN g.seq % 5 = 0 THEN 'CASH_AT_COUNTER'
    WHEN g.seq % 7 = 0 THEN 'CARD'
    ELSE 'PAYHERE'
  END,
  IF(g.seq % 2 = 0, IF(g.seq % 4 = 0, 150, 250), 0),
  CASE
    WHEN g.seq % 5 = 0 THEN 0
    WHEN g.seq % 2 = 0 THEN ROUND(p.basePrice * (1 + (g.seq % 3)) * 0.065)
    ELSE ROUND(p.basePrice * (1 + (g.seq % 3)) * 0.06)
  END,
  (
    p.basePrice * (1 + (g.seq % 3))
    + IF(g.seq % 2 = 0, IF(g.seq % 4 = 0, 150, 250), 0)
    + CASE
        WHEN g.seq % 5 = 0 THEN 0
        WHEN g.seq % 2 = 0 THEN ROUND(p.basePrice * (1 + (g.seq % 3)) * 0.065)
        ELSE ROUND(p.basePrice * (1 + (g.seq % 3)) * 0.06)
      END
  ),
  STR_TO_DATE(
    CONCAT(
      @seed_year, '-', LPAD(@seed_month, 2, '0'), '-', LPAD(g.day_num, 2, '0'), ' ',
      LPAD(9 + (g.slot * 2) + (g.day_num % 2), 2, '0'), ':',
      LPAD((g.slot * 7) % 60, 2, '0'), ':',
      LPAD((g.seq * 13) % 60, 2, '0')
    ),
    '%Y-%m-%d %H:%i:%s'
  )
FROM (
  SELECT ((d.day_num - 1) * 6 + sl.slot) AS seq, d.day_num, sl.slot
  FROM (
    SELECT 1 AS day_num UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
    UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
    UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
    UNION ALL SELECT 13 UNION ALL SELECT 14
  ) d
  CROSS JOIN (
    SELECT 1 AS slot UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
    UNION ALL SELECT 5 UNION ALL SELECT 6
  ) sl
  WHERE sl.slot <= @orders_per_day
) g
JOIN (
  SELECT pr.id, pr.name, pr.basePrice, (@prod_rn := @prod_rn + 1) - 1 AS rn
  FROM products pr
  CROSS JOIN (SELECT @prod_rn := -1) init
  WHERE pr.isAvailable = 1
  ORDER BY pr.sortOrder, pr.name
) p ON p.rn = (g.seq - 1) % @product_count;

INSERT INTO `orders` (
  `id`, `orderNumber`, `userId`, `guestName`, `guestPhone`, `storeId`, `orderMode`, `status`,
  `paymentMethod`, `paymentStatus`, `paymentRef`, `subtotal`, `deliveryFee`, `convenientFee`,
  `discount`, `loyaltyDiscount`, `total`, `prepaidAmount`, `pickupTime`, `estimatedMinutes`,
  `deliveryAddressLine`, `deliveryCity`, `deliveryDistrict`, `deliveryLat`, `deliveryLng`,
  `platform`, `createdAt`, `updatedAt`
)
SELECT
  s.order_id,
  s.order_number,
  NULL,
  CONCAT('Nugegoda Guest ', s.seq),
  CONCAT('077', LPAD(2000000 + s.seq, 7, '0')),
  @nugegoda_store_id,
  s.order_mode,
  'DELIVERED',
  s.payment_method,
  'PAID',
  CONCAT('NUGE-PAY-', s.seq),
  s.subtotal,
  s.delivery_fee,
  s.convenient_fee,
  0,
  0,
  s.total,
  IF(s.payment_method IN ('PAYHERE', 'CARD'), s.total, 0),
  IF(s.order_mode = 'TAKEAWAY', DATE_FORMAT(s.created_at, '%H:%i'), NULL),
  20 + (s.seq % 15),
  IF(s.order_mode = 'DELIVERY', CONCAT(s.slot, ' High Level Road, Nugegoda'), NULL),
  IF(s.order_mode = 'DELIVERY', 'Nugegoda', NULL),
  IF(s.order_mode = 'DELIVERY', 'Colombo', NULL),
  IF(s.order_mode = 'DELIVERY', 6.8726 + (s.seq % 10) / 1000, NULL),
  IF(s.order_mode = 'DELIVERY', 79.8897 + (s.seq % 10) / 1000, NULL),
  0,
  s.created_at,
  DATE_ADD(s.created_at, INTERVAL 35 MINUTE)
FROM tmp_july_nugegoda s
ON DUPLICATE KEY UPDATE
  `status` = VALUES(`status`),
  `total` = VALUES(`total`),
  `updatedAt` = VALUES(`updatedAt`);

INSERT INTO `order_items` (
  `id`, `orderId`, `productId`, `productName`, `size`, `quantity`, `unitPrice`, `totalPrice`
)
SELECT
  CONCAT(s.order_id, '-item'),
  s.order_id,
  s.product_id,
  s.product_name,
  'REGULAR',
  s.quantity,
  s.unit_price,
  s.subtotal
FROM tmp_july_nugegoda s
ON DUPLICATE KEY UPDATE
  `quantity` = VALUES(`quantity`),
  `totalPrice` = VALUES(`totalPrice`);

INSERT INTO `order_status_events` (`id`, `orderId`, `status`, `note`, `createdAt`)
SELECT CONCAT(s.order_id, '-evt-1'), s.order_id, 'RECEIVED', 'Order received', s.created_at
FROM tmp_july_nugegoda s
ON DUPLICATE KEY UPDATE `createdAt` = VALUES(`createdAt`);

INSERT INTO `order_status_events` (`id`, `orderId`, `status`, `note`, `createdAt`)
SELECT
  CONCAT(s.order_id, '-evt-2'),
  s.order_id,
  IF(s.order_mode = 'DELIVERY', 'OUT_FOR_DELIVERY', 'READY'),
  NULL,
  DATE_ADD(s.created_at, INTERVAL 15 MINUTE)
FROM tmp_july_nugegoda s
ON DUPLICATE KEY UPDATE `createdAt` = VALUES(`createdAt`);

INSERT INTO `order_status_events` (`id`, `orderId`, `status`, `note`, `createdAt`)
SELECT
  CONCAT(s.order_id, '-evt-3'),
  s.order_id,
  'DELIVERED',
  'Seed order completed',
  DATE_ADD(s.created_at, INTERVAL 35 MINUTE)
FROM tmp_july_nugegoda s
ON DUPLICATE KEY UPDATE `createdAt` = VALUES(`createdAt`);

DROP TEMPORARY TABLE IF EXISTS tmp_july_nugegoda;

-- Summary
SELECT
  DATE(createdAt) AS order_date,
  COUNT(*) AS orders,
  SUM(total) AS revenue_lkr
FROM orders
WHERE storeId = @nugegoda_store_id
  AND id LIKE 'seed-nuge-jul26-%'
GROUP BY DATE(createdAt)
ORDER BY order_date;
