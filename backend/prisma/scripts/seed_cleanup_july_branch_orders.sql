-- =============================================================================
-- Remove July multi-branch seed only (seed-jul26-*, legacy seed-nuge-jul26-*).
-- Does NOT delete other seed-* prefixes or real orders.
--
--   npx prisma db execute --schema packages/db/prisma/schema.prisma \
--     --file backend/prisma/scripts/seed_cleanup_july_branch_orders.sql
-- =============================================================================

BEGIN;

DELETE FROM wallet_transactions wt
WHERE wt."orderId" IN (
  SELECT id FROM orders WHERE id LIKE 'seed-jul26-%' OR id LIKE 'seed-nuge-jul26-%'
)
   OR wt.id LIKE 'seed-jul26-%';

DELETE FROM refunds
WHERE id LIKE 'seed-jul26-%' OR id LIKE 'seed-nuge-jul26-%'
   OR "orderId" LIKE 'seed-jul26-%' OR "orderId" LIKE 'seed-nuge-jul26-%';

DELETE FROM delivery.delivery_job_orders
WHERE "jobId" LIKE 'seed-jul26-job-%'
   OR "orderId" LIKE 'seed-jul26-%'
   OR "orderId" LIKE 'seed-nuge-jul26-%';

DELETE FROM delivery.delivery_attempts
WHERE "jobId" LIKE 'seed-jul26-job-%'
   OR "orderId" LIKE 'seed-jul26-%'
   OR "orderId" LIKE 'seed-nuge-jul26-%';

DELETE FROM delivery.delivery_events
WHERE "jobId" LIKE 'seed-jul26-job-%'
   OR "orderId" LIKE 'seed-jul26-%'
   OR "orderId" LIKE 'seed-nuge-jul26-%';

DELETE FROM delivery.delivery_jobs WHERE id LIKE 'seed-jul26-job-%';

DELETE FROM delivery.driver_locations WHERE id LIKE 'seed-jul26-loc-%';

DELETE FROM orders WHERE id LIKE 'seed-jul26-%' OR id LIKE 'seed-nuge-jul26-%';

DELETE FROM delivery.driver_locations
WHERE "driverId" IN (SELECT id FROM admin_users WHERE id LIKE 'seed-jul26-driver-%');

DELETE FROM admin_users WHERE id LIKE 'seed-jul26-driver-%';

SELECT COUNT(*)::int AS remaining_jul26_orders FROM orders WHERE id LIKE 'seed-jul26-%';
SELECT COUNT(*)::int AS remaining_jul26_jobs FROM delivery.delivery_jobs WHERE id LIKE 'seed-jul26-job-%';

COMMIT;
