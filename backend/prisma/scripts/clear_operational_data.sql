-- =============================================================================
-- DESTRUCTIVE: wipe all operational data on bingchun (catalog + staff only).
--
-- REMOVES: orders, wallets, payouts, delivery ops, customers, notifications,
--          loyalty history, carts, stock audit/allocations tied to operations.
-- KEEPS: stores, products, zones, roles, admin_users, permissions, promo_codes
--        (rows), system/loyalty/app settings, cancel/refund configs, stock batch
--        master rows (batches/groups), loyalty/spin offer definitions.
--
-- Backup first (on VPS):
--   docker exec $(docker ps -qf name=srv-captain--bing-chun-production-db) \
--     pg_dump -U postgres -Fc bingchun > bingchun-backup-$(date +%Y%m%d).dump
--
-- Run on direct Postgres (not PgBouncer):
--   npx prisma db execute --schema ../packages/db/prisma/schema.prisma \
--     --file prisma/scripts/inspect_operational_data.sql
--   npx prisma db execute --schema ../packages/db/prisma/schema.prisma \
--     --file prisma/scripts/clear_operational_data.sql
-- =============================================================================

SET search_path TO public, delivery;

BEGIN;

-- ── Finance / wallets ───────────────────────────────────────────────────────
DELETE FROM platform_earnings;
DELETE FROM platform_monthly_settlements;
DELETE FROM commission_settlements;
DELETE FROM jason_ledger_entries;
DELETE FROM store_withdrawals;
DELETE FROM wallet_transactions;
DELETE FROM store_wallets;

-- ── Delivery finance & ops ────────────────────────────────────────────────────
DELETE FROM delivery.delivery_payouts;

DELETE FROM delivery.delivery_job_rejections;
DELETE FROM delivery.delivery_job_orders;
DELETE FROM delivery.delivery_attempts;
DELETE FROM delivery.delivery_events;
DELETE FROM delivery.delivery_otps;
DELETE FROM delivery.driver_complaints;
DELETE FROM delivery.merit_point_history;
DELETE FROM delivery.rider_ratings;
DELETE FROM delivery.delivery_jobs;
DELETE FROM delivery.driver_locations;
DELETE FROM delivery.driver_shifts;
DELETE FROM delivery.driver_devices;
DELETE FROM delivery.driver_branch_requests;
DELETE FROM delivery.delivery_access_logs;
DELETE FROM delivery.delivery_outbox;
DELETE FROM delivery.rider_profiles;

-- ── Orders & inventory audit trail ───────────────────────────────────────────
DELETE FROM refunds;
DELETE FROM promotion_usages;
DELETE FROM stock_batch_allocations;
DELETE FROM stock_audit_logs;
DELETE FROM store_product_reservations;
DELETE FROM platform_ratings;
DELETE FROM channel_messages;
DELETE FROM orders;

-- ── Customer engagement ───────────────────────────────────────────────────────
DELETE FROM conversation_sessions;
DELETE FROM customer_channels;
DELETE FROM spin_results;
DELETE FROM customer_audit_logs;
DELETE FROM customer_notifications;
DELETE FROM admin_notifications;
DELETE FROM notifications;
DELETE FROM loyalty_transactions;
DELETE FROM otp_records;
DELETE FROM wishlist_items;
DELETE FROM product_ratings;
DELETE FROM carts;
DELETE FROM users;

-- ── Re-init empty branch wallets ─────────────────────────────────────────────
INSERT INTO store_wallets (
  id, "storeId", balance, "totalEarnings", "totalWithdrawn", currency, "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  s.id,
  0,
  0,
  0,
  'LKR',
  NOW(),
  NOW()
FROM stores s;

UPDATE promo_codes SET "usedCount" = 0;

UPDATE admin_users
SET "dutyStatus" = 'OFF_DUTY', "updatedAt" = NOW()
WHERE "dutyStatus" IS DISTINCT FROM 'OFF_DUTY';

SELECT metric, n
FROM (
  SELECT 1 AS ord, 'orders_total' AS metric, COUNT(*)::int AS n FROM orders
  UNION ALL
  SELECT 2, 'users_total', COUNT(*)::int FROM users
  UNION ALL
  SELECT 3, 'wallet_tx_total', COUNT(*)::int FROM wallet_transactions
  UNION ALL
  SELECT 4, 'store_wallets', COUNT(*)::int FROM store_wallets
  UNION ALL
  SELECT 5, 'store_wallets_nonzero', COUNT(*)::int
  FROM store_wallets WHERE balance <> 0 OR "totalEarnings" <> 0 OR "totalWithdrawn" <> 0
  UNION ALL
  SELECT 6, 'delivery_jobs_total', COUNT(*)::int FROM delivery.delivery_jobs
  UNION ALL
  SELECT 7, 'stores', COUNT(*)::int FROM stores
  UNION ALL
  SELECT 8, 'staff_admin_users', COUNT(*)::int FROM admin_users
) x
ORDER BY ord;

COMMIT;
