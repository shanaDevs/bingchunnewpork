-- Platform discount payback configuration and settlement fields

ALTER TABLE "stores" ADD COLUMN "platformDiscountPaybackEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "promotion_usages" ADD COLUMN "platformPaybackEligible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "promotion_usages" ADD COLUMN "platformPaybackAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "promotion_usages" ADD COLUMN "platformPaybackSettledAt" TIMESTAMP(3);
ALTER TABLE "promotion_usages" ADD COLUMN "platformPaybackWithdrawalId" TEXT;
ALTER TABLE "promotion_usages" ADD COLUMN "platformPaybackReversedAt" TIMESTAMP(3);

CREATE INDEX "promotion_usages_storeId_platformPaybackSettledAt_idx" ON "promotion_usages"("storeId", "platformPaybackSettledAt");

ALTER TABLE "commission_settlements" ADD COLUMN "platformPaybackAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "platform_earnings" ADD COLUMN "platformPaybackAmount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "platform_payback_setting_logs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "previousValue" BOOLEAN NOT NULL,
    "newValue" BOOLEAN NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_payback_setting_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_payback_setting_logs_storeId_createdAt_idx" ON "platform_payback_setting_logs"("storeId", "createdAt");

ALTER TABLE "platform_payback_setting_logs" ADD CONSTRAINT "platform_payback_setting_logs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
