-- =============================================================================
-- Branch SKU availability (diagnose empty menu / admin 500s after catalog sync).
--   npx prisma db execute --schema ../packages/db/prisma/schema.prisma \
--     --file prisma/scripts/inspect_store_products.sql
-- =============================================================================

SELECT metric, n
FROM (
  SELECT 1 AS ord, 'store_products_total' AS metric, COUNT(*)::int AS n FROM store_products
  UNION ALL
  SELECT 2, 'store_products_available', COUNT(*)::int FROM store_products WHERE "isAvailable" = true
  UNION ALL
  SELECT 3, 'store_products_unavailable', COUNT(*)::int FROM store_products WHERE "isAvailable" = false
  UNION ALL
  SELECT 4, 'products_available', COUNT(*)::int FROM products WHERE "isAvailable" = true
) x
ORDER BY ord;

SELECT s.name AS store_name,
       COUNT(*)::int AS skus,
       COUNT(*) FILTER (WHERE sp."isAvailable" = true)::int AS available_skus,
       COUNT(*) FILTER (WHERE sp."isAvailable" = false)::int AS unavailable_skus
FROM store_products sp
JOIN stores s ON s.id = sp."storeId"
GROUP BY s.id, s.name
ORDER BY unavailable_skus DESC, s.name
LIMIT 15;
