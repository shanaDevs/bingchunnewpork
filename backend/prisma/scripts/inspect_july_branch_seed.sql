SELECT COUNT(*)::int AS jul26_orders FROM orders WHERE id LIKE 'seed-jul26-%';
SELECT COUNT(DISTINCT "storeId")::int AS stores_with_jul26 FROM orders WHERE id LIKE 'seed-jul26-%';
SELECT COUNT(*)::int AS jul26_jobs FROM delivery.delivery_jobs WHERE id LIKE 'seed-jul26-job-%';
SELECT status::text, COUNT(*)::int AS n FROM orders WHERE id LIKE 'seed-jul26-%' GROUP BY status ORDER BY n DESC;
SELECT COUNT(*)::int AS day26_queue FROM orders WHERE id LIKE 'seed-jul26-%' AND "createdAt" >= '2026-07-26' AND "createdAt" < '2026-07-27';
SELECT COUNT(*)::int AS orphan_delivered_delivery
FROM orders o
WHERE o.id LIKE 'seed-jul26-%'
  AND o.status = 'DELIVERED'
  AND o."orderMode" = 'DELIVERY'
  AND NOT EXISTS (SELECT 1 FROM delivery.delivery_job_orders djo WHERE djo."orderId" = o.id);
