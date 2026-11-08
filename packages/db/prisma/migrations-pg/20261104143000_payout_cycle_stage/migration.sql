-- Branch payout two-stage cycle: FIRST / SECOND rolling windows

CREATE TYPE "public"."PayoutCycleStage" AS ENUM ('FIRST', 'SECOND');

ALTER TABLE "public"."app_settings"
  ADD COLUMN IF NOT EXISTS "commissionSlabsJson" JSONB;

ALTER TABLE "public"."store_withdrawals"
  ADD COLUMN IF NOT EXISTS "cycleStage" "public"."PayoutCycleStage" NOT NULL DEFAULT 'FIRST',
  ADD COLUMN IF NOT EXISTS "cyclePairId" TEXT;

CREATE INDEX IF NOT EXISTS "store_withdrawals_cyclePairId_idx"
  ON "public"."store_withdrawals"("cyclePairId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_withdrawals_cyclePairId_fkey'
  ) THEN
    ALTER TABLE "public"."store_withdrawals"
      ADD CONSTRAINT "store_withdrawals_cyclePairId_fkey"
      FOREIGN KEY ("cyclePairId") REFERENCES "public"."store_withdrawals"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY "storeId" ORDER BY "periodFrom" ASC NULLS LAST, "createdAt" ASC) AS rn
  FROM "public"."store_withdrawals"
  WHERE status IN ('PENDING', 'APPROVED')
),
staged AS (
  SELECT
    id,
    CASE WHEN rn % 2 = 1 THEN 'FIRST'::"public"."PayoutCycleStage" ELSE 'SECOND'::"public"."PayoutCycleStage" END AS stage
  FROM ordered
)
UPDATE "public"."store_withdrawals" sw
SET "cycleStage" = staged.stage
FROM staged
WHERE sw.id = staged.id;

WITH ordered AS (
  SELECT
    id,
    "cycleStage",
    LAG(id) OVER (PARTITION BY "storeId" ORDER BY "periodFrom" ASC NULLS LAST, "createdAt" ASC) AS prev_id,
    LAG("cycleStage") OVER (PARTITION BY "storeId" ORDER BY "periodFrom" ASC NULLS LAST, "createdAt" ASC) AS prev_stage
  FROM "public"."store_withdrawals"
  WHERE status IN ('PENDING', 'APPROVED')
)
UPDATE "public"."store_withdrawals" sw
SET "cyclePairId" = ordered.prev_id
FROM ordered
WHERE sw.id = ordered.id
  AND ordered."cycleStage" = 'SECOND'
  AND ordered.prev_stage = 'FIRST'
  AND ordered.prev_id IS NOT NULL;
