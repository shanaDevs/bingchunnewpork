-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('CHANGED_MIND', 'ORDERED_BY_MISTAKE', 'TAKING_TOO_LONG', 'FOUND_CHEAPER_ELSEWHERE', 'PAYMENT_ISSUES', 'OTHER');

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "cancellationReason" "CancellationReason" NOT NULL,
    "customReasonText" TEXT,
    "refundTier" TEXT,
    "requestedAmount" INTEGER,
    "approvedAmount" INTEGER,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "adminNotes" TEXT,
    "processedByAdminId" TEXT,
    "processedAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paymentRef" TEXT,
    "refundRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refunds_orderId_key" ON "refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_customerId_status_idx" ON "refunds"("customerId", "status");

-- CreateIndex
CREATE INDEX "refunds_status_createdAt_idx" ON "refunds"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
