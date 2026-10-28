-- Loyalty campaign (platform default + per-branch overrides)
CREATE TABLE IF NOT EXISTS "loyalty_campaigns" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NULL,
    "offer1Enabled" BOOLEAN NOT NULL DEFAULT true,
    "offer1DiscountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "offer1DiscountValue" INTEGER NOT NULL DEFAULT 10,
    "offer1MinSubtotal" INTEGER NOT NULL DEFAULT 0,
    "offer2Enabled" BOOLEAN NOT NULL DEFAULT true,
    "offer2DiscountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "offer2DiscountValue" INTEGER NOT NULL DEFAULT 5,
    "offer2WindowDays" INTEGER NOT NULL DEFAULT 7,
    "offer2MinSubtotal" INTEGER NOT NULL DEFAULT 1000,
    "offer3Enabled" BOOLEAN NOT NULL DEFAULT true,
    "offer3RequiredOrders" INTEGER NOT NULL DEFAULT 3,
    "offer3OptionAMinEach" INTEGER NOT NULL DEFAULT 1500,
    "offer3OptionBCombinedMin" INTEGER NOT NULL DEFAULT 4500,
    "offer3MatchMode" TEXT NOT NULL DEFAULT 'A_OR_B',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NULL,
    "expiresAt" TIMESTAMP(3) NULL,
    "ownership" TEXT NULL DEFAULT 'PLATFORM',
    "branchSharePct" INTEGER NULL DEFAULT 0,
    "platformSharePct" INTEGER NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loyalty_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_campaigns_storeId_key" ON "loyalty_campaigns"("storeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_campaigns_storeId_fkey'
  ) THEN
    ALTER TABLE "loyalty_campaigns"
      ADD CONSTRAINT "loyalty_campaigns_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "spin_wheel_offers" ADD COLUMN IF NOT EXISTS "storeId" TEXT NULL;
CREATE INDEX IF NOT EXISTS "spin_wheel_offers_storeId_isActive_idx" ON "spin_wheel_offers"("storeId", "isActive");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spin_wheel_offers_storeId_fkey'
  ) THEN
    ALTER TABLE "spin_wheel_offers"
      ADD CONSTRAINT "spin_wheel_offers_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "loyalty_campaigns" (
    "id",
    "storeId",
    "offer1Enabled",
    "offer1DiscountType",
    "offer1DiscountValue",
    "offer1MinSubtotal",
    "offer2Enabled",
    "offer2DiscountType",
    "offer2DiscountValue",
    "offer2WindowDays",
    "offer2MinSubtotal",
    "offer3Enabled",
    "offer3RequiredOrders",
    "offer3OptionAMinEach",
    "offer3OptionBCombinedMin",
    "offer3MatchMode",
    "isActive",
    "ownership",
    "branchSharePct",
    "platformSharePct",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    NULL,
    true,
    'PERCENTAGE',
    10,
    0,
    true,
    'PERCENTAGE',
    5,
    7,
    1000,
    true,
    3,
    1500,
    4500,
    'A_OR_B',
    true,
    'PLATFORM',
    0,
    100,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "loyalty_campaigns" WHERE "storeId" IS NULL
);
