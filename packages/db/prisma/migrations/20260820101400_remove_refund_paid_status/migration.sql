-- Remove PAID from RefundStatus; Complete is the final approved state

UPDATE "refunds"
SET "status" = 'COMPLETE'
WHERE "status" = 'PAID';

ALTER TYPE "RefundStatus" RENAME TO "RefundStatus_old";

CREATE TYPE "RefundStatus" AS ENUM ('RECEIVED', 'COMPLETE', 'REJECTED');

ALTER TABLE "refunds"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "refunds"
  ALTER COLUMN "status" TYPE "RefundStatus"
  USING ("status"::text)::"RefundStatus";

ALTER TABLE "refunds"
  ALTER COLUMN "status" SET DEFAULT 'RECEIVED';

DROP TYPE "RefundStatus_old";
