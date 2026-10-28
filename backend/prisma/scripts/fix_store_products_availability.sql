-- =============================================================================
-- Re-enable branch SKUs when the catalog product is available (post sync from test).
-- Safe to re-run. Does not change stock counts.
-- =============================================================================

BEGIN;

UPDATE store_products sp
SET "isAvailable" = true, "updatedAt" = NOW()
FROM products p
WHERE sp."productId" = p.id
  AND p."isAvailable" = true
  AND sp."isAvailable" = false;

SELECT COUNT(*)::int AS still_unavailable
FROM store_products sp
JOIN products p ON p.id = sp."productId"
WHERE p."isAvailable" = true AND sp."isAvailable" = false;

COMMIT;
