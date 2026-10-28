-- Simplify refund system: new status flow, drop templates and status events

DROP TABLE IF EXISTS "refund_status_events";
DROP TABLE IF EXISTS "refund_templates";

-- Add new columns first
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "cancelledWithinWindow" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "salesTotal" INTEGER;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "deliveryFee" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "convenienceFee" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "orderTotal" INTEGER;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "refundPercentage" DOUBLE PRECISION;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "refundAmount" INTEGER;

-- Backfill new columns from existing data where possible (before dropping legacy columns)
UPDATE "refunds" r
SET
  "orderTotal" = COALESCE(r."orderTotal", o."total"),
  "salesTotal" = COALESCE(
    r."salesTotal",
    GREATEST(0, o."subtotal" - o."discount" - o."loyaltyDiscount")
  ),
  "deliveryFee" = COALESCE(r."deliveryFee", o."deliveryFee"),
  "convenienceFee" = COALESCE(r."convenienceFee", o."convenientFee"),
  "refundAmount" = COALESCE(r."refundAmount", r."approvedAmount", r."requestedAmount"),
  "cancelledWithinWindow" = CASE
    WHEN r."refundTier" = 'full' THEN true
    ELSE false
  END
FROM "orders" o
WHERE o."id" = r."orderId";

UPDATE "refunds"
SET
  "orderTotal" = COALESCE("orderTotal", 0),
  "salesTotal" = COALESCE("salesTotal", 0)
WHERE "orderTotal" IS NULL OR "salesTotal" IS NULL;

ALTER TABLE "refunds" ALTER COLUMN "salesTotal" SET NOT NULL;
ALTER TABLE "refunds" ALTER COLUMN "orderTotal" SET NOT NULL;

-- Drop legacy columns
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "refundTier";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "requestedAmount";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "approvedAmount";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "paymentMethod";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "paymentRef";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "refundRef";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "productSaleIncluded";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "deliveryFeeIncluded";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "convenienceFeeIncluded";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "includeGatewayFee";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "additionalCostBearer";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "deductionPercent";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "refundDeduction";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "penaltyBranchPct";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "penaltyBranchShare";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "penaltyPlatformShare";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "gatewayFee";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "gatewayFeeBearer";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "branchBears";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "platformBears";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "customerDeduction";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "branchBearerPct";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "customerBearerPct";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "platformBearerPct";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "paymentStatus";

DROP INDEX IF EXISTS "refunds_paymentStatus_idx";

-- Replace RefundStatus enum
ALTER TYPE "RefundStatus" RENAME TO "RefundStatus_old";

CREATE TYPE "RefundStatus" AS ENUM ('RECEIVED', 'COMPLETE', 'REJECTED', 'PAID');

ALTER TABLE "refunds"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "refunds"
  ALTER COLUMN "status" TYPE "RefundStatus"
  USING (
    CASE "status"::text
      WHEN 'REQUESTED' THEN 'RECEIVED'
      WHEN 'PROCESSING' THEN 'RECEIVED'
      WHEN 'COMPLETED' THEN 'COMPLETE'
      WHEN 'REJECTED' THEN 'REJECTED'
      ELSE 'RECEIVED'
    END
  )::"RefundStatus";

ALTER TABLE "refunds"
  ALTER COLUMN "status" SET DEFAULT 'RECEIVED';

DROP TYPE "RefundStatus_old";
DROP TYPE IF EXISTS "RefundPaymentStatus";
