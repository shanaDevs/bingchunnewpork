-- CreateTable
CREATE TABLE "refund_status_events" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL,
    "note" TEXT,
    "adminId" TEXT,
    "adminName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refund_status_events_refundId_createdAt_idx" ON "refund_status_events"("refundId", "createdAt");

-- AddForeignKey
ALTER TABLE "refund_status_events" ADD CONSTRAINT "refund_status_events_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill initial REQUESTED events for existing refunds
INSERT INTO "refund_status_events" ("id", "refundId", "status", "note", "createdAt")
SELECT gen_random_uuid()::text, "id", 'REQUESTED', 'Refund requested by customer', "createdAt"
FROM "refunds";
