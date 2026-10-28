-- CreateEnum
CREATE TYPE "RefundPaymentStatus" AS ENUM ('UNPAID', 'PAYMENT_PROCESSING', 'PAID');

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN "productSaleIncluded" BOOLEAN,
ADD COLUMN "deliveryFeeIncluded" BOOLEAN,
ADD COLUMN "convenienceFeeIncluded" BOOLEAN,
ADD COLUMN "deductionPercent" DOUBLE PRECISION,
ADD COLUMN "refundDeduction" INTEGER,
ADD COLUMN "penaltyAmount" INTEGER,
ADD COLUMN "penaltyBranchPct" INTEGER,
ADD COLUMN "penaltyBranchShare" INTEGER,
ADD COLUMN "penaltyPlatformShare" INTEGER,
ADD COLUMN "gatewayFee" INTEGER,
ADD COLUMN "gatewayFeeBearer" TEXT,
ADD COLUMN "branchBears" INTEGER,
ADD COLUMN "platformBears" INTEGER,
ADD COLUMN "paymentStatus" "RefundPaymentStatus",
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "paidByAdminId" TEXT,
ADD COLUMN "paymentNote" TEXT;

-- CreateIndex
CREATE INDEX "refunds_paymentStatus_idx" ON "refunds"("paymentStatus");
