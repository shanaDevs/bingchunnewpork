-- Marks a due branch payout period as in review before the bank slip is uploaded.
CREATE TABLE IF NOT EXISTS "branch_payout_reviews" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "markedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_payout_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "branch_payout_review_period"
    ON "branch_payout_reviews"("storeId", "periodFrom", "periodTo");

CREATE INDEX IF NOT EXISTS "branch_payout_reviews_storeId_idx"
    ON "branch_payout_reviews"("storeId");

DO $$ BEGIN
    ALTER TABLE "branch_payout_reviews"
        ADD CONSTRAINT "branch_payout_reviews_storeId_fkey"
        FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
