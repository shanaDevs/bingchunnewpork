-- =============================================================================
-- Read-only catalog + operational sanity counts (run per database).
-- Compare test (bingchun_db01) vs live (bingchun) before/after catalog sync.
--
--   npx prisma db execute --schema ../packages/db/prisma/schema.prisma \
--     --file prisma/scripts/inspect_catalog_pair.sql
-- =============================================================================

SELECT metric, n
FROM (
  SELECT 1 AS ord, 'stores' AS metric, COUNT(*)::int AS n FROM stores
  UNION ALL
  SELECT 2, 'products', COUNT(*)::int FROM products
  UNION ALL
  SELECT 3, 'categories', COUNT(*)::int FROM categories
  UNION ALL
  SELECT 4, 'toppings', COUNT(*)::int FROM toppings
  UNION ALL
  SELECT 5, 'store_products', COUNT(*)::int FROM store_products
  UNION ALL
  SELECT 6, 'delivery_zones', COUNT(*)::int FROM delivery.delivery_zones
  UNION ALL
  SELECT 7, 'admin_users', COUNT(*)::int FROM admin_users
  UNION ALL
  SELECT 8, 'permissions', COUNT(*)::int FROM permissions
  UNION ALL
  SELECT 9, 'promo_codes', COUNT(*)::int FROM promo_codes
  UNION ALL
  SELECT 10, 'loyalty_campaigns', COUNT(*)::int FROM loyalty_campaigns
  UNION ALL
  SELECT 11, 'spin_wheel_offers', COUNT(*)::int FROM spin_wheel_offers
  UNION ALL
  SELECT 12, 'orders_total', COUNT(*)::int FROM orders
  UNION ALL
  SELECT 13, 'users_total', COUNT(*)::int FROM users
  UNION ALL
  SELECT 14, 'wallet_tx_total', COUNT(*)::int FROM wallet_transactions
  UNION ALL
  SELECT 15, 'store_wallets', COUNT(*)::int FROM store_wallets
) x
ORDER BY ord;
