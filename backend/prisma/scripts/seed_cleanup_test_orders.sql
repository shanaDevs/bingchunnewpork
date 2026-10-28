-- =============================================================================
-- Remove ALL SQL test seed data (seed-* orders and their children).
--
-- Covers prefixes: seed-cap30-*, seed-month-*, seed-sm26-*, seed-trend-*, seed-live-*,
-- seed-jul26-*, seed-nuge-jul26-*
-- Also removes: seed-live-job-* delivery jobs, seed-live-loc-* GPS rows,
-- seed-live-driver-* rider accounts, wallet rows and refunds for seed orders.
-- Real (non seed-*) orders and real admin logins are NOT deleted.
--
--   npx prisma db execute --schema ../packages/db/prisma/schema.prisma \
--     --file prisma/scripts/seed_cleanup_test_orders.sql
-- =============================================================================

BEGIN;

-- Riders that were put ONLINE by the live seed go back to OFF_DUTY (real riders only).
UPDATE admin_users au
SET "dutyStatus" = 'OFF_DUTY', "updatedAt" = NOW()
WHERE au.id NOT LIKE 'seed-live-driver-%'
  AND au.id IN (
    SELECT DISTINCT dl."driverId" FROM driver_locations dl WHERE dl.id LIKE 'seed-live-loc-%'
  );

-- Wallet ledger rows tied to seed orders (ORDER_PAYMENT / REFUND).
DELETE FROM wallet_transactions wt
WHERE wt."orderId" IN (SELECT id FROM orders WHERE id LIKE 'seed-%')
   OR wt.id LIKE 'seed-%';

DELETE FROM refunds WHERE id LIKE 'seed-%' OR "orderId" LIKE 'seed-%';

-- Delivery data (jobs and GPS rows do not cascade from orders).
DELETE FROM delivery_job_rejections
WHERE "jobId" IN (SELECT id FROM delivery.delivery_jobs WHERE id LIKE 'seed-%');

DELETE FROM delivery_job_orders
WHERE "jobId" LIKE 'seed-%' OR "orderId" LIKE 'seed-%';

DELETE FROM delivery_attempts
WHERE "jobId" LIKE 'seed-%' OR "orderId" LIKE 'seed-%';

DELETE FROM delivery_events
WHERE "jobId" LIKE 'seed-%' OR "orderId" LIKE 'seed-%';

DELETE FROM delivery.delivery_jobs WHERE id LIKE 'seed-%';

DELETE FROM delivery.driver_locations WHERE id LIKE 'seed-%';

-- Orders (cascades order_items, order_status_events, etc.).
DELETE FROM orders WHERE id LIKE 'seed-%';

-- Seed-only rider accounts (never real logins).
DELETE FROM driver_locations
WHERE "driverId" IN (SELECT id FROM admin_users WHERE id LIKE 'seed-live-driver-%');

DELETE FROM driver_locations
WHERE "driverId" IN (SELECT id FROM admin_users WHERE id LIKE 'seed-jul26-driver-%');

DELETE FROM admin_users WHERE id LIKE 'seed-live-driver-%' OR id LIKE 'seed-jul26-driver-%';

SELECT COUNT(*)::int AS remaining_seed_orders FROM orders WHERE id LIKE 'seed-%';
SELECT COUNT(*)::int AS remaining_seed_jobs FROM delivery.delivery_jobs WHERE id LIKE 'seed-%';
SELECT COUNT(*)::int AS remaining_seed_drivers
FROM admin_users WHERE id LIKE 'seed-live-driver-%' OR id LIKE 'seed-jul26-driver-%';

COMMIT;
