-- Configurable cancel window + dynamic cancel reasons with refund ranges

ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "cancelWindowMinutes" INTEGER NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS "cancel_reason_configs" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "minRefundPercentage" DOUBLE PRECISION NOT NULL,
  "maxRefundPercentage" DOUBLE PRECISION NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cancel_reason_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cancel_reason_configs_value_key" ON "cancel_reason_configs"("value");

ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "cancelReasonConfigId" TEXT;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "configuredMinPercentage" DOUBLE PRECISION;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "configuredMaxPercentage" DOUBLE PRECISION;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "exceededRange" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'refunds'
      AND column_name = 'cancellationReason'
      AND udt_name = 'CancellationReason'
  ) THEN
    ALTER TABLE "refunds" ALTER COLUMN "cancellationReason" TYPE TEXT USING "cancellationReason"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refunds_cancelReasonConfigId_fkey'
  ) THEN
    ALTER TABLE "refunds"
      ADD CONSTRAINT "refunds_cancelReasonConfigId_fkey"
      FOREIGN KEY ("cancelReasonConfigId") REFERENCES "cancel_reason_configs"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DROP TYPE IF EXISTS "CancellationReason";

INSERT INTO "cancel_reason_configs" ("id", "label", "value", "minRefundPercentage", "maxRefundPercentage", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, seed.label, seed.value, seed.min_pct, seed.max_pct, true, seed.sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('Changed my mind', 'CHANGED_MIND', 80, 100, 1),
    ('Ordered by mistake', 'ORDERED_BY_MISTAKE', 80, 100, 2),
    ('Taking too long', 'TAKING_TOO_LONG', 70, 90, 3),
    ('Found a better price elsewhere', 'FOUND_CHEAPER_ELSEWHERE', 70, 90, 4),
    ('Payment issues', 'PAYMENT_ISSUES', 80, 100, 5),
    ('Other (please specify)', 'OTHER', 60, 100, 6)
) AS seed(label, value, min_pct, max_pct, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM "cancel_reason_configs" LIMIT 1);
