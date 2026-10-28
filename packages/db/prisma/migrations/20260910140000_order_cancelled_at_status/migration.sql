-- Persist the order status at cancel time so rider earnings can credit
-- mid-ride customer cancels (COD has no refund row to copy from).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancelledAtStatus" "OrderStatus";

UPDATE "orders" o
SET "cancelledAtStatus" = r."cancelledAtStatus"
FROM "refunds" r
WHERE r."orderId" = o.id
  AND o.status = 'CANCELLED'
  AND o."cancelledAtStatus" IS NULL
  AND r."cancelledAtStatus" IS NOT NULL;

UPDATE "orders" o
SET "cancelledAtStatus" = 'OUT_FOR_DELIVERY'
WHERE o.status = 'CANCELLED'
  AND o."cancelledAtStatus" IS NULL
  AND EXISTS (
    SELECT 1 FROM "order_status_events" e
    WHERE e."orderId" = o.id AND e.status = 'OUT_FOR_DELIVERY'
  );
