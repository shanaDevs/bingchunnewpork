-- =============================================================================
-- Read-only inventory of dummy / SQL-seed rows vs remaining real data.
-- For full operational counts (orders, wallets, all users) see inspect_operational_data.sql.
-- Does not modify anything. Run against direct Postgres (not PgBouncer):
--
--   psql "$DIRECT_DATABASE_URL" -f prisma/scripts/inspect_dummy_data.sql
--
-- Dummy fingerprints (seed-dummy-data.ts): @bingchun-test.lk, dummy bcrypt hash,
-- "Delivery Run %" jobs, extra promo codes, STMT-% settlements, ADJUSTMENT
-- "Balance adjustment" wallet rows.
-- SQL seed fingerprints: seed-%, seed-live-job-*, seed-live-driver-*.
-- =============================================================================

SET search_path TO public, delivery;

SELECT metric, n
FROM (
  SELECT 1 AS ord, 'stores' AS metric, COUNT(*)::int AS n FROM stores
  UNION ALL
  SELECT 2, 'active_stores', COUNT(*)::int FROM stores WHERE "isActive" = true
  UNION ALL
  SELECT 3, 'products', COUNT(*)::int FROM products
  UNION ALL
  SELECT 4, 'staff_admin_users', COUNT(*)::int FROM admin_users WHERE id NOT LIKE 'seed-live-driver-%'
  UNION ALL
  SELECT 5, 'seed_live_drivers', COUNT(*)::int FROM admin_users WHERE id LIKE 'seed-live-driver-%'
  UNION ALL
  SELECT 6, 'test_users_bingchun_test_lk', COUNT(*)::int FROM users WHERE email ILIKE '%@bingchun-test.lk'
  UNION ALL
  SELECT 7, 'test_users_dummy_password_hash', COUNT(*)::int
  FROM users
  WHERE "passwordHash" = '$2a$12$dummyHashForTestingOnlyXXXXXXXXXXXXXXXXXXXXXXXXXX'
  UNION ALL
  SELECT 8, 'seed_percent_orders', COUNT(*)::int FROM orders WHERE id LIKE 'seed-%'
  UNION ALL
  SELECT 9, 'dummy_user_orders', COUNT(*)::int
  FROM orders o
  WHERE o."userId" IN (SELECT id FROM users WHERE email ILIKE '%@bingchun-test.lk')
  UNION ALL
  SELECT 10, 'remaining_real_orders', COUNT(*)::int
  FROM orders o
  WHERE o.id NOT LIKE 'seed-%'
    AND (
      o."userId" IS NULL
      OR o."userId" NOT IN (SELECT id FROM users WHERE email ILIKE '%@bingchun-test.lk')
    )
  UNION ALL
  SELECT 11, 'orders_total', COUNT(*)::int FROM orders
  UNION ALL
  SELECT 12, 'seed_jobs', COUNT(*)::int FROM delivery.delivery_jobs WHERE id LIKE 'seed-%'
  UNION ALL
  SELECT 13, 'delivery_run_jobs', COUNT(*)::int FROM delivery.delivery_jobs WHERE title LIKE 'Delivery Run %'
  UNION ALL
  SELECT 14, 'delivery_jobs_total', COUNT(*)::int FROM delivery.delivery_jobs
  UNION ALL
  SELECT 15, 'seed_gps', COUNT(*)::int FROM delivery.driver_locations WHERE id LIKE 'seed-%'
  UNION ALL
  SELECT 16, 'dummy_promos', COUNT(*)::int
  FROM promo_codes
  WHERE code IN (
    'SUMMER25', 'BOBA100', 'NEWAPP20', 'FREEDELIVERY',
    'WEEKEND15', 'LOYALTY200', 'BIRTHDAY30', 'EXPIRED10'
  )
  UNION ALL
  SELECT 17, 'stmt_settlements_no_receipt', COUNT(*)::int
  FROM commission_settlements
  WHERE "statementRef" LIKE 'STMT-%' AND "receiptUrl" IS NULL
  UNION ALL
  SELECT 18, 'commission_settlements_total', COUNT(*)::int FROM commission_settlements
  UNION ALL
  SELECT 19, 'wallet_tx_on_dummy_or_seed_orders', COUNT(*)::int
  FROM wallet_transactions wt
  WHERE wt.id LIKE 'seed-%'
     OR wt."orderId" LIKE 'seed-%'
     OR wt."orderId" IN (
       SELECT id FROM orders
       WHERE id LIKE 'seed-%'
          OR "userId" IN (SELECT id FROM users WHERE email ILIKE '%@bingchun-test.lk')
     )
  UNION ALL
  SELECT 20, 'wallet_tx_dummy_adjustments', COUNT(*)::int
  FROM wallet_transactions
  WHERE type = 'ADJUSTMENT' AND description = 'Balance adjustment'
  UNION ALL
  SELECT 21, 'wallet_tx_total', COUNT(*)::int FROM wallet_transactions
  UNION ALL
  SELECT 22, 'wallet_tx_not_dummy', COUNT(*)::int
  FROM wallet_transactions wt
  WHERE wt.id NOT LIKE 'seed-%'
    AND (wt."orderId" IS NULL OR wt."orderId" NOT LIKE 'seed-%')
    AND (
      wt."orderId" IS NULL
      OR wt."orderId" NOT IN (
        SELECT id FROM orders
        WHERE id LIKE 'seed-%'
           OR "userId" IN (SELECT id FROM users WHERE email ILIKE '%@bingchun-test.lk')
      )
    )
    AND NOT (type = 'ADJUSTMENT' AND description = 'Balance adjustment')
) x
ORDER BY ord;
