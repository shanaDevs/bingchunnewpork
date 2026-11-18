-- Draft "in review" marks for unpaid delivery payout due periods (super admin workflow)
CREATE TABLE IF NOT EXISTS delivery."delivery_payout_due_reviews" (
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "markedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_payout_due_reviews_pkey" PRIMARY KEY ("periodFrom", "periodTo")
);

CREATE INDEX IF NOT EXISTS "delivery_payout_due_reviews_periodTo_idx"
    ON delivery."delivery_payout_due_reviews"("periodTo");