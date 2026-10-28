-- CreateTable
CREATE TABLE "refund_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "includeProductSale" BOOLEAN NOT NULL DEFAULT true,
    "includeDeliveryFee" BOOLEAN NOT NULL DEFAULT true,
    "includeConvenienceFee" BOOLEAN NOT NULL DEFAULT true,
    "includeGatewayFee" BOOLEAN NOT NULL DEFAULT false,
    "refundAmountPercent" INTEGER NOT NULL DEFAULT 100,
    "applyPenalty" BOOLEAN NOT NULL DEFAULT true,
    "branchBearerPct" INTEGER NOT NULL DEFAULT 100,
    "customerBearerPct" INTEGER NOT NULL DEFAULT 0,
    "platformBearerPct" INTEGER NOT NULL DEFAULT 0,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refund_templates_name_key" ON "refund_templates"("name");

-- CreateIndex
CREATE INDEX "refund_templates_isActive_sortOrder_idx" ON "refund_templates"("isActive", "sortOrder");

-- Seed starter templates
INSERT INTO "refund_templates" (
    "id", "name", "description", "isActive", "sortOrder",
    "includeProductSale", "includeDeliveryFee", "includeConvenienceFee", "includeGatewayFee",
    "refundAmountPercent", "applyPenalty",
    "branchBearerPct", "customerBearerPct", "platformBearerPct",
    "createdAt", "updatedAt"
) VALUES
(
    'tpl-full-refund', 'Full Refund',
    '100% product and delivery, all fees included, penalty borne by branch.',
    true, 0,
    true, true, true, true,
    100, true,
    100, 0, 0,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
    'tpl-partial-window', 'Partial After Window',
    '100% product and delivery only; no convenience or gateway; customer bears penalty share.',
    true, 1,
    true, true, false, false,
    100, true,
    0, 100, 0,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
    'tpl-no-penalty', 'No Penalty',
    '100% refund with no penalty applied.',
    true, 2,
    true, true, true, false,
    100, false,
    100, 0, 0,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
