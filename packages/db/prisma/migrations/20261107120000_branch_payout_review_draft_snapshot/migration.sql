-- Frozen payout draft invoice snapshot (amounts locked at draft save).
ALTER TABLE "branch_payout_reviews" ADD COLUMN IF NOT EXISTS "invoiceData" JSONB;
ALTER TABLE "branch_payout_reviews" ADD COLUMN IF NOT EXISTS "breakdownSnapshot" JSONB;
