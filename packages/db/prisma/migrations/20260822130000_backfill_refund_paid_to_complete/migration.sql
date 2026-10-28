-- Leftover RefundStatus.PAID rows break Prisma reads after the enum was narrowed.
UPDATE "refunds"
SET "status" = 'COMPLETE'
WHERE "status"::text = 'PAID';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'RefundStatus'
      AND e.enumlabel = 'PAID'
  ) THEN
    ALTER TYPE "RefundStatus" RENAME TO "RefundStatus_old";

    CREATE TYPE "RefundStatus" AS ENUM ('RECEIVED', 'COMPLETE', 'REJECTED');

    ALTER TABLE "refunds"
      ALTER COLUMN "status" DROP DEFAULT;

    ALTER TABLE "refunds"
      ALTER COLUMN "status" TYPE "RefundStatus"
      USING ("status"::text)::"RefundStatus";

    ALTER TABLE "refunds"
      ALTER COLUMN "status" SET DEFAULT 'RECEIVED';

    IF to_regclass('public.refund_status_events') IS NOT NULL THEN
      UPDATE "refund_status_events"
      SET "status" = 'COMPLETE'
      WHERE "status"::text = 'PAID';

      ALTER TABLE "refund_status_events"
        ALTER COLUMN "status" TYPE "RefundStatus"
        USING ("status"::text)::"RefundStatus";
    END IF;

    DROP TYPE "RefundStatus_old";
  END IF;
END $$;
