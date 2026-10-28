-- =============================================================================
-- Seed orders for 1–14 July 2026 (Asia/Colombo business hours)
--
-- Creates ~6 delivered orders per day (84 total) with line items + status events.
-- Uses existing active stores/products — safe to run if IDs already exist
-- (ON DUPLICATE KEY UPDATE skips re-insert).
--
-- Apply:
--   mysql -u USER -p DATABASE < prisma/migrations/seed_orders_july_1_14.sql
--
-- Optional: set a single branch (uncomment to use one branch only):
-- SET @seed_store_id = (SELECT id FROM stores WHERE name LIKE '%Nugegoda%' AND isActive = 1 LIMIT 1);
SET @seed_store_id = NULL;
-- =============================================================================

SET NAMES utf8mb4;
SET @seed_year = 2026;
SET @seed_month = 7;
SET @orders_per_day = 6;

SELECT COUNT(*) INTO @store_count FROM stores WHERE isActive = 1 AND (@seed_store_id IS NULL OR id = @seed_store_id);
SELECT COUNT(*) INTO @product_count FROM products WHERE isAvailable = 1;

-- Fail fast if catalog is empty
SELECT IF(@store_count > 0 AND @product_count > 0, 1, (SELECT 1 FROM (SELECT 1) x WHERE 1 = 0));

DROP TEMPORARY TABLE IF EXISTS tmp_july_seed;
CREATE TEMPORARY TABLE tmp_july_seed (
  seq INT NOT NULL PRIMARY KEY,
  day_num TINYINT NOT NULL,
  slot INT NOT NULL,
  order_id VARCHAR(191) NOT NULL,
  order_number VARCHAR(191) NOT NULL,
  store_id VARCHAR(191) NOT NULL,
  product_id VARCHAR(191) NOT NULL,
  product_name VARCHAR(191) NOT NULL,
  unit_price INT NOT NULL,
  quantity INT NOT NULL,
  subtotal INT NOT NULL,
  order_mode ENUM('DELIVERY','TAKEAWAY') NOT NULL,
  payment_method ENUM('PAYHERE','CARD','CASH_AT_COUNTER','CASH_ON_DELIVERY','LOYALTY_POINTS') NOT NULL,
  delivery_fee INT NOT NULL,
  convenient_fee INT NOT NULL,
  total INT NOT NULL,
  created_at DATETIME(3) NOT NULL
);

-- Build 14 days × @orders_per_day rows (no CTE — HeidiSQL / MariaDB friendly)
INSERT INTO tmp_july_seed (
  seq, day_num, slot, order_id, order_number, store_id, product_id, product_name,
  unit_price, quantity, subtotal, order_mode, payment_method, delivery_fee,
  convenient_fee, total, created_at
)
SELECT
  g.seq,
  g.day_num,
  g.slot,
  CONCAT('seed-jul26-d', LPAD(g.day_num, 2, '0'), '-', LPAD(g.slot, 4, '0')) AS order_id,
  CONCAT(
    'BC',
    DATE_FORMAT(STR_TO_DATE(CONCAT(@seed_year, '-', @seed_month, '-', g.day_num), '%Y-%c-%e'), '%y%m%d'),
    '-',
    LPAD(g.seq, 4, '0')
  ) AS order_number,
  st.id AS store_id,
  p.id AS product_id,
  p.name AS product_name,
  p.basePrice AS unit_price,
  1 + (g.seq % 3) AS quantity,
  p.basePrice * (1 + (g.seq % 3)) AS subtotal,
  IF(g.seq % 2 = 0, 'DELIVERY', 'TAKEAWAY') AS order_mode,
  CASE
    WHEN g.seq % 5 = 0 THEN 'CASH_AT_COUNTER'
    WHEN g.seq % 7 = 0 THEN 'CARD'
    ELSE 'PAYHERE'
  END AS payment_method,
  IF(g.seq % 2 = 0, IF(g.seq % 4 = 0, 150, 250), 0) AS delivery_fee,
  CASE
    WHEN g.seq % 5 = 0 THEN 0
    WHEN g.seq % 2 = 0 THEN ROUND(p.basePrice * (1 + (g.seq % 3)) * 0.065)
    ELSE ROUND(p.basePrice * (1 + (g.seq % 3)) * 0.06)
  END AS convenient_fee,
  (
    p.basePrice * (1 + (g.seq % 3))
    + IF(g.seq % 2 = 0, IF(g.seq % 4 = 0, 150, 250), 0)
    + CASE
        WHEN g.seq % 5 = 0 THEN 0
        WHEN g.seq % 2 = 0 THEN ROUND(p.basePrice * (1 + (g.seq % 3)) * 0.065)
        ELSE ROUND(p.basePrice * (1 + (g.seq % 3)) * 0.06)
      END
  ) AS total,
  STR_TO_DATE(
    CONCAT(
      @seed_year, '-', LPAD(@seed_month, 2, '0'), '-', LPAD(g.day_num, 2, '0'), ' ',
      LPAD(9 + (g.slot * 2) + (g.day_num % 2), 2, '0'), ':',
      LPAD((g.slot * 7) % 60, 2, '0'), ':',
      LPAD((g.seq * 13) % 60, 2, '0')
    ),
    '%Y-%m-%d %H:%i:%s'
  ) AS created_at
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
  SELECT s.id, (@store_rn := @store_rn + 1) - 1 AS rn
  FROM stores s
  CROSS JOIN (SELECT @store_rn := -1) init
  WHERE s.isActive = 1
    AND (@seed_store_id IS NULL OR s.id = @seed_store_id)
  ORDER BY s.name
) st ON st.rn = (g.seq - 1) % @store_count
JOIN (
  SELECT pr.id, pr.name, pr.basePrice, (@prod_rn := @prod_rn + 1) - 1 AS rn
  FROM products pr
  CROSS JOIN (SELECT @prod_rn := -1) init
  WHERE pr.isAvailable = 1
  ORDER BY pr.sortOrder, pr.name
) p ON p.rn = (g.seq - 1) % @product_count;

-- ── Orders ───────────────────────────────────────────────────────────────────
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
  CONCAT('July Guest ', s.seq),
  CONCAT('077', LPAD(1000000 + s.seq, 7, '0')),
  s.store_id,
  s.order_mode,
  'DELIVERED',
  s.payment_method,
  'PAID',
  CONCAT('SEED-PAY-', s.seq),
  s.subtotal,
  s.delivery_fee,
  s.convenient_fee,
  0,
  0,
  s.total,
  IF(s.payment_method IN ('PAYHERE', 'CARD'), s.total, 0),
  IF(s.order_mode = 'TAKEAWAY', DATE_FORMAT(s.created_at, '%H:%i'), NULL),
  20 + (s.seq % 15),
  IF(s.order_mode = 'DELIVERY', CONCAT(s.slot, ' Galle Road'), NULL),
  IF(s.order_mode = 'DELIVERY', 'Colombo', NULL),
  IF(s.order_mode = 'DELIVERY', 'Colombo', NULL),
  IF(s.order_mode = 'DELIVERY', 6.87 + (s.seq % 20) / 100, NULL),
  IF(s.order_mode = 'DELIVERY', 79.88 + (s.seq % 15) / 100, NULL),
  0,
  s.created_at,
  DATE_ADD(s.created_at, INTERVAL 35 MINUTE)
FROM tmp_july_seed s
ON DUPLICATE KEY UPDATE
  `status` = VALUES(`status`),
  `total` = VALUES(`total`),
  `updatedAt` = VALUES(`updatedAt`);

-- ── Order items (one line per order) ─────────────────────────────────────────
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
FROM tmp_july_seed s
ON DUPLICATE KEY UPDATE
  `quantity` = VALUES(`quantity`),
  `totalPrice` = VALUES(`totalPrice`);

-- ── Status timeline (RECEIVED → DELIVERED) ───────────────────────────────────
INSERT INTO `order_status_events` (`id`, `orderId`, `status`, `note`, `createdAt`)
SELECT
  CONCAT(s.order_id, '-evt-1'),
  s.order_id,
  'RECEIVED',
  'Order received',
  s.created_at
FROM tmp_july_seed s
ON DUPLICATE KEY UPDATE `createdAt` = VALUES(`createdAt`);

INSERT INTO `order_status_events` (`id`, `orderId`, `status`, `note`, `createdAt`)
SELECT
  CONCAT(s.order_id, '-evt-2'),
  s.order_id,
  IF(s.order_mode = 'DELIVERY', 'OUT_FOR_DELIVERY', 'READY'),
  NULL,
  DATE_ADD(s.created_at, INTERVAL 15 MINUTE)
FROM tmp_july_seed s
ON DUPLICATE KEY UPDATE `createdAt` = VALUES(`createdAt`);

INSERT INTO `order_status_events` (`id`, `orderId`, `status`, `note`, `createdAt`)
SELECT
  CONCAT(s.order_id, '-evt-3'),
  s.order_id,
  'DELIVERED',
  'Seed order completed',
  DATE_ADD(s.created_at, INTERVAL 35 MINUTE)
FROM tmp_july_seed s
ON DUPLICATE KEY UPDATE `createdAt` = VALUES(`createdAt`);

DROP TEMPORARY TABLE IF EXISTS tmp_july_seed;

-- Quick check
SELECT
  DATE(createdAt) AS order_date,
  COUNT(*) AS orders,
  SUM(total) AS revenue_lkr
FROM orders
WHERE id LIKE 'seed-jul26-%'
GROUP BY DATE(createdAt)
ORDER BY order_date;
