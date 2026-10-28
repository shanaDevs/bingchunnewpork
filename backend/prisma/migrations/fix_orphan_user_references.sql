-- =============================================================================
-- Fix orphan userId foreign-key references
--
-- Symptom: prisma.order.create() fails with
--   Foreign key constraint violated: `userId` (P2003)
--
-- Cause: JWT / carts / orders reference user IDs that no longer exist in `users`
--        (common after DB reset, manual user deletes, or env mismatch).
--
-- Run on production DB (change database name if needed):
--   mysql -u USER -p DATABASE < prisma/migrations/fix_orphan_user_references.sql
-- =============================================================================

USE `bingchun_db01`;

SET NAMES utf8mb4;

-- ── 1) Diagnostic counts ─────────────────────────────────────────────────────
SELECT 'orphan_carts' AS table_name, COUNT(*) AS orphan_rows
FROM `carts` c
LEFT JOIN `users` u ON u.id = c.userId
WHERE u.id IS NULL;

SELECT 'orphan_addresses' AS table_name, COUNT(*) AS orphan_rows
FROM `addresses` a
LEFT JOIN `users` u ON u.id = a.userId
WHERE u.id IS NULL;

SELECT 'orphan_wishlist_items' AS table_name, COUNT(*) AS orphan_rows
FROM `wishlist_items` w
LEFT JOIN `users` u ON u.id = w.userId
WHERE u.id IS NULL;

SELECT 'orphan_orders_userId' AS table_name, COUNT(*) AS orphan_rows
FROM `orders` o
LEFT JOIN `users` u ON u.id = o.userId
WHERE o.userId IS NOT NULL AND u.id IS NULL;

SELECT 'orphan_loyalty_transactions' AS table_name, COUNT(*) AS orphan_rows
FROM `loyalty_transactions` lt
LEFT JOIN `users` u ON u.id = lt.userId
WHERE u.id IS NULL;

-- ── 2) Repair ────────────────────────────────────────────────────────────────
SET FOREIGN_KEY_CHECKS = 0;

-- Cart line items for missing carts/users
DELETE cit FROM `cart_item_toppings` cit
INNER JOIN `cart_items` ci ON ci.id = cit.cartItemId
INNER JOIN `carts` c ON c.id = ci.cartId
LEFT JOIN `users` u ON u.id = c.userId
WHERE u.id IS NULL;

DELETE ci FROM `cart_items` ci
INNER JOIN `carts` c ON c.id = ci.cartId
LEFT JOIN `users` u ON u.id = c.userId
WHERE u.id IS NULL;

DELETE c FROM `carts` c
LEFT JOIN `users` u ON u.id = c.userId
WHERE u.id IS NULL;

-- Addresses without a valid user
DELETE a FROM `addresses` a
LEFT JOIN `users` u ON u.id = a.userId
WHERE u.id IS NULL;

-- Wishlist rows without a valid user
DELETE w FROM `wishlist_items` w
LEFT JOIN `users` u ON u.id = w.userId
WHERE u.id IS NULL;

-- Loyalty history without a valid user
DELETE lt FROM `loyalty_transactions` lt
LEFT JOIN `users` u ON u.id = lt.userId
WHERE u.id IS NULL;

-- Orders: keep order history but detach missing users (userId is nullable)
UPDATE `orders` o
LEFT JOIN `users` u ON u.id = o.userId
SET o.userId = NULL
WHERE o.userId IS NOT NULL AND u.id IS NULL;

SET FOREIGN_KEY_CHECKS = 1;

-- ── 3) Verify (should all be 0) ──────────────────────────────────────────────
SELECT 'orphan_carts' AS table_name, COUNT(*) AS orphan_rows
FROM `carts` c
LEFT JOIN `users` u ON u.id = c.userId
WHERE u.id IS NULL
UNION ALL
SELECT 'orphan_orders_userId', COUNT(*)
FROM `orders` o
LEFT JOIN `users` u ON u.id = o.userId
WHERE o.userId IS NOT NULL AND u.id IS NULL;

SELECT 'Orphan userId references cleaned. Customers with stale login must sign in again.' AS result;
