-- =============================================================================
-- Remove SQL test seed (seed-*) AND TypeScript dummy-volume data.
-- Keeps stores, products, toppings, zones, roles, real admin_users, and
-- non-dummy orders (e.g. demo customer from prisma/seed.ts).
--
-- Covers:
--   seed-cap30-*, seed-month-*, seed-sm26-*, seed-trend-*, seed-live-*
--   test.userN@bingchun-test.lk customers and their orders/jobs/wallets
--   dummy promos, STMT-% settlements with no receipt, Delivery Run jobs
--
-- Run against direct Postgres (not PgBouncer). Inspect first:
--   psql "$DIRECT_DATABASE_URL" -f prisma/scripts/inspect_dummy_data.sql
--   psql "$DIRECT_DATABASE_URL" -f prisma/scripts/cleanup_dummy_data.sql
-- Then:
--   psql "$DIRECT_DATABASE_URL" -f prisma/scripts/repair_wallet_balance_after.sql
--
-- Real (non seed-*) orders whose user is not @bingchun-test.lk are NOT deleted.
-- Real admin logins are NOT deleted.
-- =============================================================================

SET search_path TO public, delivery;

BEGIN;

CREATE TEMP TABLE dummy_users ON COMMIT DROP AS
SELECT id
FROM users
WHERE email ILIKE '%@bingchun-test.lk'
   OR "passwordHash" = '$2a$12$dummyHashForTestingOnlyXXXXXXXXXXXXXXXXXXXXXXXXXX';

CREATE TEMP TABLE dummy_orders ON COMMIT DROP AS
SELECT id
FROM orders
WHERE id LIKE 'seed-%'
   OR "userId" IN (SELECT id FROM dummy_users);

CREATE TEMP TABLE dummy_jobs ON COMMIT DROP AS
SELECT id
FROM delivery_jobs
WHERE id LIKE 'seed-%'
   OR title LIKE 'Delivery Run %'
   OR (
     EXISTS (
       SELECT 1 FROM delivery_job_orders djo
       WHERE djo."jobId" = delivery_jobs.id
         AND djo."orderId" IN (SELECT id FROM dummy_orders)
     )
     AND NOT EXISTS (
       SELECT 1 FROM delivery_job_orders djo
       WHERE djo."jobId" = delivery_jobs.id
         AND djo."orderId" NOT IN (SELECT id FROM dummy_orders)
     )
   );

-- Riders that were put ONLINE by the live SQL seed go back to OFF_DUTY.
UPDATE admin_users au
SET "dutyStatus" = 'OFF_DUTY', "updatedAt" = NOW()
WHERE au.id NOT LIKE 'seed-live-driver-%'
  AND au.id IN (
    SELECT DISTINCT dl."driverId" FROM driver_locations dl WHERE dl.id LIKE 'seed-live-loc-%'
  );

-- Wallet ledger (no FK to orders — must delete before orders).
DELETE FROM wallet_transactions wt
WHERE wt.id LIKE 'seed-%'
   OR wt."orderId" IN (SELECT id FROM dummy_orders)
   OR (wt.type = 'ADJUSTMENT' AND wt.description = 'Balance adjustment');

DELETE FROM refunds
WHERE id LIKE 'seed-%'
   OR "orderId" IN (SELECT id FROM dummy_orders);

-- Delivery children that do not always cascade the way we need for job-first deletes.
DELETE FROM delivery_job_rejections
WHERE "jobId" IN (SELECT id FROM dummy_jobs);

DELETE FROM delivery_job_orders
WHERE "jobId" IN (SELECT id FROM dummy_jobs)
   OR "orderId" IN (SELECT id FROM dummy_orders);

DELETE FROM delivery_attempts
WHERE "jobId" IN (SELECT id FROM dummy_jobs)
   OR "orderId" IN (SELECT id FROM dummy_orders);

DELETE FROM delivery_events
WHERE "jobId" IN (SELECT id FROM dummy_jobs)
   OR "orderId" IN (SELECT id FROM dummy_orders);

DELETE FROM delivery.driver_locations
WHERE id LIKE 'seed-%'
   OR "jobId" LIKE 'seed-%';

DELETE FROM delivery_jobs WHERE id IN (SELECT id FROM dummy_jobs);

-- Notifications / loyalty tied to dummy users or dummy orders (no order FK).
DELETE FROM notifications
WHERE "userId" IN (SELECT id FROM dummy_users)
   OR email ILIKE '%@bingchun-test.lk';

DELETE FROM customer_notifications
WHERE "userId" IN (SELECT id FROM dummy_users)
   OR "orderId" IN (SELECT id FROM dummy_orders);

DELETE FROM admin_notifications
WHERE "orderId" IN (SELECT id FROM dummy_orders)
   OR (type = 'LOW_STOCK' AND message LIKE '%is running low in stock.');

DELETE FROM loyalty_transactions
WHERE "userId" IN (SELECT id FROM dummy_users)
   OR "orderId" IN (SELECT id FROM dummy_orders);

DELETE FROM otp_records WHERE "userId" IN (SELECT id FROM dummy_users);

-- Orders (cascades items, status events, ratings, otps, complaints, etc.).
DELETE FROM orders WHERE id IN (SELECT id FROM dummy_orders);

-- Dummy customers (addresses/carts/wishlist cascade from users).
DELETE FROM users WHERE id IN (SELECT id FROM dummy_users);

-- Dummy extra promos from seed-dummy-data.ts (not WELCOME10 / BINGCHUN50).
DELETE FROM promo_codes
WHERE code IN (
  'SUMMER25', 'BOBA100', 'NEWAPP20', 'FREEDELIVERY',
  'WEEKEND15', 'LOYALTY200', 'BIRTHDAY30', 'EXPIRED10'
)
AND NOT EXISTS (
  SELECT 1 FROM promotion_usages pu WHERE pu."promoCodeId" = promo_codes.id
);

DELETE FROM commission_settlements
WHERE "statementRef" LIKE 'STMT-%' AND "receiptUrl" IS NULL;

-- Seed-only rider accounts (never real logins).
DELETE FROM delivery.driver_locations
WHERE "driverId" IN (SELECT id FROM admin_users WHERE id LIKE 'seed-%');

DELETE FROM admin_users WHERE id LIKE 'seed-%';

-- Empty leftover dummy jobs if any job-order rows vanished via order cascade.
DELETE FROM delivery_jobs dj
WHERE title LIKE 'Delivery Run %'
   OR dj.id LIKE 'seed-%';

-- Dummy seeder created wallets with random totals; zero rows with no remaining ledger.
UPDATE store_wallets sw
SET
  balance = 0,
  "totalEarnings" = 0,
  "totalWithdrawn" = 0,
  "updatedAt" = NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM wallet_transactions wt WHERE wt."storeId" = sw."storeId"
);

SELECT metric, n
FROM (
  SELECT 1 AS ord, 'remaining_seed_orders' AS metric, COUNT(*)::int AS n
  FROM orders WHERE id LIKE 'seed-%'
  UNION ALL
  SELECT 2, 'remaining_dummy_users', COUNT(*)::int
  FROM users WHERE email ILIKE '%@bingchun-test.lk'
  UNION ALL
  SELECT 3, 'remaining_seed_jobs', COUNT(*)::int
  FROM delivery.delivery_jobs WHERE id LIKE 'seed-%' OR title LIKE 'Delivery Run %'
  UNION ALL
  SELECT 4, 'remaining_seed_drivers', COUNT(*)::int
  FROM admin_users WHERE id LIKE 'seed-live-driver-%'
  UNION ALL
  SELECT 5, 'remaining_real_orders', COUNT(*)::int
  FROM orders o
  WHERE o.id NOT LIKE 'seed-%'
    AND (
      o."userId" IS NULL
      OR o."userId" NOT IN (SELECT id FROM users WHERE email ILIKE '%@bingchun-test.lk')
    )
  UNION ALL
  SELECT 6, 'stores', COUNT(*)::int FROM stores
  UNION ALL
  SELECT 7, 'staff_admin_users', COUNT(*)::int
  FROM admin_users WHERE id NOT LIKE 'seed-live-driver-%'
) x
ORDER BY ord;

COMMIT;
