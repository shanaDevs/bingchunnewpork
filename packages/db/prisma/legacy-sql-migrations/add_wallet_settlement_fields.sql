ALTER TABLE store_wallets
  ADD COLUMN lastSettledAt DATETIME(3) NULL;

ALTER TABLE wallet_transactions
  ADD COLUMN settledAt DATETIME(3) NULL,
  ADD COLUMN periodFrom DATETIME(3) NULL,
  ADD COLUMN periodTo DATETIME(3) NULL;
