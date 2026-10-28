-- Prevent concurrent PENDING withdrawal requests for the same branch (FIN-004).
CREATE UNIQUE INDEX "withdrawal_one_pending_per_store"
  ON "store_withdrawals"("storeId")
  WHERE "status" = 'PENDING';
