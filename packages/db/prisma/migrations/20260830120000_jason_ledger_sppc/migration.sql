-- Shared promotion platform contribution: link Jason expenses to branch payouts.
ALTER TABLE "jason_ledger_entries" ADD COLUMN IF NOT EXISTS "storeId" TEXT;
ALTER TABLE "jason_ledger_entries" ADD COLUMN IF NOT EXISTS "storeWithdrawalId" TEXT;
ALTER TABLE "jason_ledger_entries" ADD COLUMN IF NOT EXISTS "balanceBefore" INTEGER;
ALTER TABLE "jason_ledger_entries" ADD COLUMN IF NOT EXISTS "balanceAfter" INTEGER;

CREATE INDEX IF NOT EXISTS "jason_ledger_entries_storeWithdrawalId_idx"
  ON "jason_ledger_entries"("storeWithdrawalId");
