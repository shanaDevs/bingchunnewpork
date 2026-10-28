-- =============================================================================
-- After seed-monthly-orders pilot / scale-up.
-- =============================================================================

SELECT metric, n
FROM (
  SELECT 1 AS ord, 'seed_month_orders' AS metric, COUNT(*)::int AS n FROM orders WHERE id LIKE 'seed-month-%'
  UNION ALL
  SELECT 2, 'seed_jobs', COUNT(*)::int FROM delivery.delivery_jobs WHERE id LIKE 'seed-month-%' OR id LIKE 'seed-live-%'
  UNION ALL
  SELECT 3, 'orders_total', COUNT(*)::int FROM orders
  UNION ALL
  SELECT 4, 'users_total', COUNT(*)::int FROM users
  UNION ALL
  SELECT 5, 'wallet_tx_seed', COUNT(*)::int FROM wallet_transactions WHERE id LIKE 'seed-month-%' OR "orderId" LIKE 'seed-month-%'
  UNION ALL
  SELECT 6, 'real_orders', COUNT(*)::int FROM orders WHERE id NOT LIKE 'seed-%'
) x
ORDER BY ord;

SELECT status::text AS status, "orderMode"::text AS order_mode, COUNT(*)::int AS n
FROM orders
WHERE id LIKE 'seed-month-%'
GROUP BY status, "orderMode"
ORDER BY n DESC;
