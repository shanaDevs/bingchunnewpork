-- =============================================================================
-- Kohuwala branch — clear ALL operational data for this store only
--
-- Deletes: orders (+ items / events / ratings), delivery jobs, wallet txs,
--          withdrawals, commission settlements, admin notifications,
--          delivery access logs. Resets store wallet balances to 0.
--
-- Keeps: store record, delivery zones, store products, admin users / staff.
--
-- HeidiSQL:
--   1) Left panel → double-click database bingchun_db01
--   2) File → Load SQL file → this script → F9
-- Or CLI:
--   mysql -u root -p bingchun_db01 < prisma/migrations/clear_kohuwala_branch_data.sql
-- =============================================================================

USE `bingchun_db01`;

SET NAMES utf8mb4;

-- Resolve Kohuwala store
SELECT id INTO @kohuwala_store_id
FROM stores
WHERE isActive = 1 AND name LIKE '%Kohuwala%'
LIMIT 1;

-- Fail fast if Kohuwala is missing
SELECT IF(@kohuwala_store_id IS NOT NULL, 1, (SELECT 1 FROM (SELECT 1) x WHERE 1 = 0));

SELECT @kohuwala_store_id AS kohuwala_store_id,
       (SELECT name FROM stores WHERE id = @kohuwala_store_id) AS store_name,
       (SELECT COUNT(*) FROM orders WHERE storeId = @kohuwala_store_id) AS orders_before_clear;

SET FOREIGN_KEY_CHECKS = 0;

-- Order line items / toppings
DELETE oit
FROM `order_item_toppings` oit
INNER JOIN `order_items` oi ON oi.id = oit.orderItemId
INNER JOIN `orders` o ON o.id = oi.orderId
WHERE o.storeId = @kohuwala_store_id;

DELETE oi
FROM `order_items` oi
INNER JOIN `orders` o ON o.id = oi.orderId
WHERE o.storeId = @kohuwala_store_id;

DELETE ose
FROM `order_status_events` ose
INNER JOIN `orders` o ON o.id = ose.orderId
WHERE o.storeId = @kohuwala_store_id;

DELETE pr
FROM `platform_ratings` pr
INNER JOIN `orders` o ON o.id = pr.orderId
WHERE o.storeId = @kohuwala_store_id;

DELETE rr
FROM `rider_ratings` rr
INNER JOIN `orders` o ON o.id = rr.orderId
WHERE o.storeId = @kohuwala_store_id;

-- Delivery jobs for this branch
DELETE djo
FROM `delivery_job_orders` djo
INNER JOIN `delivery_jobs` dj ON dj.id = djo.jobId
WHERE dj.storeId = @kohuwala_store_id;

DELETE FROM `delivery_jobs`
WHERE storeId = @kohuwala_store_id;

-- Detach order refs that are not hard-deleted with the order
UPDATE `loyalty_transactions` lt
INNER JOIN `orders` o ON o.id = lt.orderId
SET lt.orderId = NULL
WHERE o.storeId = @kohuwala_store_id;

UPDATE `customer_notifications` cn
INNER JOIN `orders` o ON o.id = cn.orderId
SET cn.orderId = NULL
WHERE o.storeId = @kohuwala_store_id;

DELETE FROM `admin_notifications`
WHERE storeId = @kohuwala_store_id;

-- Wallet / settlements for this branch
DELETE FROM `commission_settlements`
WHERE storeId = @kohuwala_store_id;

DELETE FROM `store_withdrawals`
WHERE storeId = @kohuwala_store_id;

DELETE FROM `wallet_transactions`
WHERE storeId = @kohuwala_store_id;

UPDATE `store_wallets`
SET balance = 0,
    totalEarnings = 0,
    totalWithdrawn = 0,
    lastSettledAt = NULL
WHERE storeId = @kohuwala_store_id;

DELETE FROM `delivery_access_logs`
WHERE storeId = @kohuwala_store_id;

-- Orders last
DELETE FROM `orders`
WHERE storeId = @kohuwala_store_id;

SET FOREIGN_KEY_CHECKS = 1;

SELECT @kohuwala_store_id AS kohuwala_store_id,
       (SELECT COUNT(*) FROM orders WHERE storeId = @kohuwala_store_id) AS orders_after_clear,
       (SELECT balance FROM store_wallets WHERE storeId = @kohuwala_store_id) AS wallet_balance_after_clear;

SELECT 'Kohuwala branch operational data cleared.' AS result;
