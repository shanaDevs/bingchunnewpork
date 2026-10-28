-- =============================================================================
-- Read-only inventory of operational / transactional data (orders, wallets, users).
-- For dummy/seed-only counts see inspect_dummy_data.sql.
-- After catalog sync from test, expect orders/wallet_tx at 0; users unchanged — see inspect_catalog_pair.sql.
--
--   npx prisma db execute --schema ../packages/db/prisma/schema.prisma \
--     --file prisma/scripts/inspect_operational_data.sql
-- =============================================================================

SELECT metric, n
FROM (
  SELECT 1 AS ord, 'stores' AS metric, COUNT(*)::int AS n FROM stores
  UNION ALL
  SELECT 2, 'products', COUNT(*)::int FROM products
  UNION ALL
  SELECT 3, 'staff_admin_users', COUNT(*)::int FROM admin_users
  UNION ALL
  SELECT 4, 'users_total', COUNT(*)::int FROM users
  UNION ALL
  SELECT 5, 'orders_total', COUNT(*)::int FROM orders
  UNION ALL
  SELECT 6, 'refunds_total', COUNT(*)::int FROM refunds
  UNION ALL
  SELECT 7, 'wallet_tx_total', COUNT(*)::int FROM wallet_transactions
  UNION ALL
  SELECT 8, 'store_wallets', COUNT(*)::int FROM store_wallets
  UNION ALL
  SELECT 9, 'store_wallets_nonzero_balance', COUNT(*)::int
  FROM store_wallets WHERE balance <> 0 OR "totalEarnings" <> 0 OR "totalWithdrawn" <> 0
  UNION ALL
  SELECT 10, 'store_withdrawals', COUNT(*)::int FROM store_withdrawals
  UNION ALL
  SELECT 11, 'commission_settlements', COUNT(*)::int FROM commission_settlements
  UNION ALL
  SELECT 12, 'platform_earnings', COUNT(*)::int FROM platform_earnings
  UNION ALL
  SELECT 13, 'platform_monthly_settlements', COUNT(*)::int FROM platform_monthly_settlements
  UNION ALL
  SELECT 14, 'jason_ledger_entries', COUNT(*)::int FROM jason_ledger_entries
  UNION ALL
  SELECT 15, 'delivery_jobs_total', COUNT(*)::int FROM delivery.delivery_jobs
  UNION ALL
  SELECT 16, 'driver_locations', COUNT(*)::int FROM delivery.driver_locations
  UNION ALL
  SELECT 17, 'delivery_payouts', COUNT(*)::int FROM delivery.delivery_payouts
  UNION ALL
  SELECT 18, 'delivery_outbox', COUNT(*)::int FROM delivery.delivery_outbox
  UNION ALL
  SELECT 19, 'rider_profiles', COUNT(*)::int FROM delivery.rider_profiles
  UNION ALL
  SELECT 20, 'customer_notifications', COUNT(*)::int FROM customer_notifications
  UNION ALL
  SELECT 21, 'admin_notifications', COUNT(*)::int FROM admin_notifications
  UNION ALL
  SELECT 22, 'notifications', COUNT(*)::int FROM notifications
  UNION ALL
  SELECT 23, 'loyalty_transactions', COUNT(*)::int FROM loyalty_transactions
  UNION ALL
  SELECT 24, 'promotion_usages', COUNT(*)::int FROM promotion_usages
  UNION ALL
  SELECT 25, 'stock_audit_logs', COUNT(*)::int FROM stock_audit_logs
  UNION ALL
  SELECT 26, 'stock_batch_allocations', COUNT(*)::int FROM stock_batch_allocations
  UNION ALL
  SELECT 27, 'carts', COUNT(*)::int FROM carts
  UNION ALL
  SELECT 28, 'promo_codes_used_count_sum', COALESCE(SUM("usedCount"), 0)::int FROM promo_codes
) x
ORDER BY ord;
