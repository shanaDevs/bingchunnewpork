-- Dashboard / wallet analytics hot paths
CREATE INDEX IF NOT EXISTS "wallet_transactions_storeId_createdAt_idx"
  ON "wallet_transactions"("storeId", "createdAt");

CREATE INDEX IF NOT EXISTS "refunds_status_processedAt_idx"
  ON "refunds"("status", "processedAt");

CREATE INDEX IF NOT EXISTS "refunds_status_createdAt_idx"
  ON "refunds"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "delivery_jobs_status_completedAt_driverId_idx"
  ON "delivery_jobs"("status", "completedAt")
  WHERE "driverId" IS NOT NULL;
