-- =============================================================================
-- Nugegoda branch — clear ALL order data, then seed 1–26 July 2026
--
-- 6 orders/day = 156 total (pickup + delivery)
-- Days 1–25: DELIVERED (history / Complete orders)
-- Day 26: active queue — RECEIVED / PREPARING / READY (shows on /admin/orders)
-- Payments: PAYHERE, CARD, CASH_AT_COUNTER, LOYALTY_POINTS
-- NO CASH_ON_DELIVERY
-- Convenience fee: delivery 6.5%, pickup (incl. cash at counter) 6%
--
-- HeidiSQL:
--   1) Left panel → double-click database bingchun_db01 (do not type the name as SQL)
--   2) File → Load SQL file → this script → F9
-- Or CLI:
--   mysql -u root -p bingchun_db01 < prisma/migrations/seed_orders_july_1_26_nugegoda.sql
-- =============================================================================

USE `bingchun_db01`;

SET NAMES utf8mb4;
SET @seed_year = 2026;
SET @seed_month = 7;
SET @seed_end_day = 26;
SET @orders_per_day = 6;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Clear ALL order-related data
-- ═══════════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM `order_item_toppings`;
DELETE FROM `order_items`;
DELETE FROM `order_status_events`;
DELETE FROM `platform_ratings`;
DELETE FROM `rider_ratings`;
DELETE FROM `delivery_job_orders`;
DELETE FROM `delivery_jobs`;
DELETE FROM `wallet_transactions` WHERE `orderId` IS NOT NULL;
UPDATE `loyalty_transactions` SET `orderId` = NULL WHERE `orderId` IS NOT NULL;
UPDATE `admin_notifications` SET `orderId` = NULL WHERE `orderId` IS NOT NULL;
DELETE FROM `orders`;

SET FOREIGN_KEY_CHECKS = 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Resolve Nugegoda store + product catalog
-- ═══════════════════════════════════════════════════════════════════════════

SELECT id INTO @nugegoda_store_id
FROM stores
WHERE isActive = 1 AND name LIKE '%Nugegoda%'
LIMIT 1;

SELECT COUNT(*) INTO @product_count FROM products WHERE isAvailable = 1;

-- Fail fast if Nugegoda or products missing
SELECT IF(@nugegoda_store_id IS NOT NULL AND @product_count > 0, 1,
  (SELECT 1 FROM (SELECT 1) x WHERE 1 = 0)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Build temp rows (26 days × 6 slots)
-- ═══════════════════════════════════════════════════════════════════════════

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
  order_mode ENUM('DELIVERY','TAKEAWAY') NOT NULL,
  payment_method ENUM('PAYHERE','CARD','CASH_AT_COUNTER','LOYALTY_POINTS') NOT NULL,
  status ENUM('RECEIVED','PREPARING','READY','DELIVERED') NOT NULL,
  delivery_fee INT NOT NULL,
  convenient_fee INT NOT NULL,
  total INT NOT NULL,
  created_at DATETIME(3) NOT NULL
);

INSERT INTO tmp_july_nugegoda (
  seq, day_num, slot, order_id, order_number, product_id, product_name,
  unit_price, quantity, subtotal, order_mode, payment_method, status, delivery_fee,
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
  -- Pickup: CASH_AT_COUNTER / PAYHERE / CARD / LOYALTY
  -- Delivery: PAYHERE / CARD / LOYALTY (never CASH_ON_DELIVERY)
  CASE
    WHEN g.seq % 2 = 1 AND g.seq % 5 = 0 THEN 'CASH_AT_COUNTER'
    WHEN g.seq % 7 = 0 THEN 'CARD'
    WHEN g.seq % 11 = 0 THEN 'LOYALTY_POINTS'
    ELSE 'PAYHERE'
  END,
  -- Day 26 → live queue; earlier days → completed history
  CASE
    WHEN g.day_num < @seed_end_day THEN 'DELIVERED'
    WHEN g.slot IN (1, 2) THEN 'RECEIVED'
    WHEN g.slot IN (3, 4) THEN 'PREPARING'
    ELSE 'READY'
  END,
  IF(g.seq % 2 = 0, IF(g.seq % 4 = 0, 150, 250), 0),
  IF(
    g.seq % 2 = 0,
    ROUND(p.basePrice * (1 + (g.seq % 3)) * 0.065),
    ROUND(p.basePrice * (1 + (g.seq % 3)) * 0.06)
  ),
  (
    p.basePrice * (1 + (g.seq % 3))
    + IF(g.seq % 2 = 0, IF(g.seq % 4 = 0, 150, 250), 0)
    + IF(
        g.seq % 2 = 0,
        ROUND(p.basePrice * (1 + (g.seq % 3)) * 0.065),
        ROUND(p.basePrice * (1 + (g.seq % 3)) * 0.06)
      )
  ),
  -- Keep hours 09:00–16:xx so "today" filters (Asia/Colombo) still match
  STR_TO_DATE(
    CONCAT(
      @seed_year, '-', LPAD(@seed_month, 2, '0'), '-', LPAD(g.day_num, 2, '0'), ' ',
      LPAD(9 + (g.slot - 1), 2, '0'), ':',
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
    UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL SELECT 16
    UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20
    UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24
    UNION ALL SELECT 25 UNION ALL SELECT 26
  ) d
  CROSS JOIN (
    SELECT 1 AS slot UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
    UNION ALL SELECT 5 UNION ALL SELECT 6
  ) sl
  WHERE sl.slot <= @orders_per_day
    AND d.day_num <= @seed_end_day
) g
JOIN (
  SELECT pr.id, pr.name, pr.basePrice,
         (ROW_NUMBER() OVER (ORDER BY pr.sortOrder, pr.name) - 1) AS rn
  FROM products pr
  WHERE pr.isAvailable = 1
) p ON p.rn = (g.seq - 1) % @product_count;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Insert orders + items + status events
-- ═══════════════════════════════════════════════════════════════════════════

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
  s.status,
  s.payment_method,
  'PAID',
  CONCAT('NUGE-PAY-', s.seq),
  s.subtotal,
  s.delivery_fee,
  s.convenient_fee,
  0,
  0,
  s.total,
  IF(s.payment_method IN ('PAYHERE', 'CARD', 'LOYALTY_POINTS'), s.total, 0),
  IF(s.order_mode = 'TAKEAWAY', DATE_FORMAT(s.created_at, '%H:%i'), NULL),
  20 + (s.seq % 15),
  IF(s.order_mode = 'DELIVERY', CONCAT(s.slot, ' High Level Road, Nugegoda'), NULL),
  IF(s.order_mode = 'DELIVERY', 'Nugegoda', NULL),
  IF(s.order_mode = 'DELIVERY', 'Colombo', NULL),
  IF(s.order_mode = 'DELIVERY', 6.8726 + (s.seq % 10) / 1000, NULL),
  IF(s.order_mode = 'DELIVERY', 79.8897 + (s.seq % 10) / 1000, NULL),
  0,
  s.created_at,
  CASE
    WHEN s.status = 'DELIVERED' THEN DATE_ADD(s.created_at, INTERVAL 35 MINUTE)
    WHEN s.status = 'READY' THEN DATE_ADD(s.created_at, INTERVAL 20 MINUTE)
    WHEN s.status = 'PREPARING' THEN DATE_ADD(s.created_at, INTERVAL 8 MINUTE)
    ELSE s.created_at
  END
FROM tmp_july_nugegoda s;

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
FROM tmp_july_nugegoda s;

-- Always: RECEIVED
INSERT INTO `order_status_events` (`id`, `orderId`, `status`, `note`, `createdAt`)
SELECT CONCAT(s.order_id, '-evt-1'), s.order_id, 'RECEIVED', 'Order received', s.created_at
FROM tmp_july_nugegoda s;

-- PREPARING+ : prep started
INSERT INTO `order_status_events` (`id`, `orderId`, `status`, `note`, `createdAt`)
SELECT
  CONCAT(s.order_id, '-evt-2'),
  s.order_id,
  'PREPARING',
  NULL,
  DATE_ADD(s.created_at, INTERVAL 8 MINUTE)
FROM tmp_july_nugegoda s
WHERE s.status IN ('PREPARING', 'READY', 'DELIVERED');

-- READY+ : ready / out for delivery milestone
INSERT INTO `order_status_events` (`id`, `orderId`, `status`, `note`, `createdAt`)
SELECT
  CONCAT(s.order_id, '-evt-3'),
  s.order_id,
  IF(s.order_mode = 'DELIVERY' AND s.status = 'DELIVERED', 'OUT_FOR_DELIVERY', 'READY'),
  NULL,
  DATE_ADD(s.created_at, INTERVAL 20 MINUTE)
FROM tmp_july_nugegoda s
WHERE s.status IN ('READY', 'DELIVERED');

-- DELIVERED only
INSERT INTO `order_status_events` (`id`, `orderId`, `status`, `note`, `createdAt`)
SELECT
  CONCAT(s.order_id, '-evt-4'),
  s.order_id,
  'DELIVERED',
  'Seed order completed',
  DATE_ADD(s.created_at, INTERVAL 35 MINUTE)
FROM tmp_july_nugegoda s
WHERE s.status = 'DELIVERED';

DROP TEMPORARY TABLE IF EXISTS tmp_july_nugegoda;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Summary
-- ═══════════════════════════════════════════════════════════════════════════

SELECT status, orderMode, COUNT(*) AS orders
FROM orders
WHERE id LIKE 'seed-nuge-jul26-%'
GROUP BY status, orderMode
ORDER BY status, orderMode;

SELECT
  DATE(createdAt) AS order_date,
  COUNT(*) AS orders,
  SUM(total) AS revenue_lkr
FROM orders
WHERE storeId = @nugegoda_store_id
  AND id LIKE 'seed-nuge-jul26-%'
GROUP BY DATE(createdAt)
ORDER BY order_date;
