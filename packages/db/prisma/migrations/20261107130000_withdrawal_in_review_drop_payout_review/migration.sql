-- Payout drafts live on store_withdrawals (IN_REVIEW) instead of branch_payout_reviews.
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';

DROP TABLE IF EXISTS "branch_payout_reviews";

CREATE UNIQUE INDEX IF NOT EXISTS "withdrawal_one_active_period"
  ON "store_withdrawals" ("storeId", "periodFrom", "periodTo")
  WHERE "status" IN ('IN_REVIEW', 'PENDING', 'APPROVED')
    AND "periodFrom" IS NOT NULL
    AND "periodTo" IS NOT NULL;
