-- =============================================================================
-- Clear ALL order / transaction / delivery operational data (global)
--
-- Removes: orders, carts, wallet ledger, withdrawals, settlements, delivery
--          jobs, delivery OTP/events, ratings tied to orders, order notifications.
--
-- Keeps:   stores, users (customers), addresses, products, categories, toppings,
--          store_products, daily_specials, promo_codes (usage reset to 0),
--          admin users / roles / permissions, delivery zones, settings,
--          product ratings, wishlists, driver profiles.
--
-- WARNING: Destructive and irreversible. Take a backup first.
--
-- HeidiSQL:
--   1) Left panel → double-click your database (e.g. bingchun_db01)
--   2) File → Load SQL file → this script → F9
-- Or CLI:
--   mysql -u root -p bingchun_db01 < prisma/migrations/clear_order_data.sql
-- =============================================================================

USE `bingchun_db01`;

SET NAMES utf8mb4;

-- ── Before counts ────────────────────────────────────────────────────────────
SELECT 'BEFORE' AS phase,
       (SELECT COUNT(*) FROM orders)                    AS orders,
       (SELECT COUNT(*) FROM cart_items)                AS cart_items,
       (SELECT COUNT(*) FROM delivery_jobs)             AS delivery_jobs,
       (SELECT COUNT(*) FROM wallet_transactions)       AS wallet_transactions,
       (SELECT COUNT(*) FROM store_withdrawals)         AS store_withdrawals,
       (SELECT COUNT(*) FROM loyalty_transactions)      AS loyalty_transactions,
       (SELECT COUNT(*) FROM customer_notifications)    AS customer_notifications,
       (SELECT COUNT(*) FROM admin_notifications)       AS admin_notifications;

SET FOREIGN_KEY_CHECKS = 0;

-- ── Order line items ─────────────────────────────────────────────────────────
DELETE FROM `order_item_toppings`;
DELETE FROM `order_items`;
DELETE FROM `order_status_events`;
DELETE FROM `platform_ratings`;
DELETE FROM `rider_ratings`;

-- ── Delivery pipeline (order-scoped) ─────────────────────────────────────────
DELETE FROM `delivery_attempts`;
DELETE FROM `delivery_otps`;
DELETE FROM `delivery_events`;
DELETE FROM `delivery_code_live`;
DELETE FROM `delivery_job_orders`;
DELETE FROM `delivery_jobs`;
DELETE FROM `delivery_outbox`;

-- ── Financial / wallet ledger (order-derived) ──────────────────────────────────
DELETE FROM `commission_settlements`;
DELETE FROM `platform_earnings`;
DELETE FROM `platform_monthly_settlements`;
DELETE FROM `store_withdrawals`;
DELETE FROM `wallet_transactions`;

UPDATE `store_wallets`
SET balance = 0,
    totalEarnings = 0,
    totalWithdrawn = 0,
    lastSettledAt = NULL;

-- ── Active carts ─────────────────────────────────────────────────────────────
DELETE FROM `cart_item_toppings`;
DELETE FROM `cart_items`;
DELETE FROM `carts`;

-- ── Loyalty & notifications (order-related history) ──────────────────────────
DELETE FROM `loyalty_transactions`;
DELETE FROM `customer_notifications`;
DELETE FROM `admin_notifications`;
DELETE FROM `notifications`;

-- ── Orders (central hub — delete last among order FK children) ───────────────
DELETE FROM `orders`;

-- ── Reset derived counters on preserved records ─────────────────────────────
UPDATE `users` SET `loyaltyPoints` = 0;
UPDATE `promo_codes` SET `usedCount` = 0;

SET FOREIGN_KEY_CHECKS = 1;

-- ── After counts (should all be 0 for cleared tables) ────────────────────────
SELECT 'AFTER' AS phase,
       (SELECT COUNT(*) FROM orders)                    AS orders,
       (SELECT COUNT(*) FROM cart_items)                AS cart_items,
       (SELECT COUNT(*) FROM delivery_jobs)             AS delivery_jobs,
       (SELECT COUNT(*) FROM wallet_transactions)       AS wallet_transactions,
       (SELECT COUNT(*) FROM store_withdrawals)         AS store_withdrawals,
       (SELECT COUNT(*) FROM loyalty_transactions)      AS loyalty_transactions,
       (SELECT COUNT(*) FROM customer_notifications)    AS customer_notifications,
       (SELECT COUNT(*) FROM admin_notifications)       AS admin_notifications;

SELECT 'Order and transaction data cleared. Stores, users, products preserved.' AS result;
