-- Admin wallet & settlement money columns: INTEGER -> DECIMAL(20,4)

ALTER TABLE "store_wallets"
  ALTER COLUMN "balance" TYPE DECIMAL(20,4) USING "balance"::numeric(20,4),
  ALTER COLUMN "totalEarnings" TYPE DECIMAL(20,4) USING "totalEarnings"::numeric(20,4),
  ALTER COLUMN "totalWithdrawn" TYPE DECIMAL(20,4) USING "totalWithdrawn"::numeric(20,4);

ALTER TABLE "store_withdrawals"
  ALTER COLUMN "amount" TYPE DECIMAL(20,4) USING "amount"::numeric(20,4);

ALTER TABLE "wallet_transactions"
  ALTER COLUMN "amount" TYPE DECIMAL(20,4) USING "amount"::numeric(20,4),
  ALTER COLUMN "balanceAfter" TYPE DECIMAL(20,4) USING "balanceAfter"::numeric(20,4);

ALTER TABLE "commission_settlements"
  ALTER COLUMN "totalCommission" TYPE DECIMAL(20,4) USING "totalCommission"::numeric(20,4),
  ALTER COLUMN "totalProviderFee" TYPE DECIMAL(20,4) USING "totalProviderFee"::numeric(20,4),
  ALTER COLUMN "platformPaybackAmount" TYPE DECIMAL(20,4) USING "platformPaybackAmount"::numeric(20,4);

ALTER TABLE "platform_earnings"
  ALTER COLUMN "commissionAmount" TYPE DECIMAL(20,4) USING "commissionAmount"::numeric(20,4),
  ALTER COLUMN "convenienceFeeAmount" TYPE DECIMAL(20,4) USING "convenienceFeeAmount"::numeric(20,4),
  ALTER COLUMN "platformPaybackAmount" TYPE DECIMAL(20,4) USING "platformPaybackAmount"::numeric(20,4),
  ALTER COLUMN "sharedPromoContributionAmount" TYPE DECIMAL(20,4) USING "sharedPromoContributionAmount"::numeric(20,4),
  ALTER COLUMN "loyaltyDiscountAmount" TYPE DECIMAL(20,4) USING "loyaltyDiscountAmount"::numeric(20,4),
  ALTER COLUMN "netPlatformCommissionAmount" TYPE DECIMAL(20,4) USING "netPlatformCommissionAmount"::numeric(20,4),
  ALTER COLUMN "completedRefundConvenienceAmount" TYPE DECIMAL(20,4) USING "completedRefundConvenienceAmount"::numeric(20,4),
  ALTER COLUMN "rejectedRefundConvenienceAmount" TYPE DECIMAL(20,4) USING "rejectedRefundConvenienceAmount"::numeric(20,4),
  ALTER COLUMN "netPlatformEarningsAmount" TYPE DECIMAL(20,4) USING "netPlatformEarningsAmount"::numeric(20,4),
  ALTER COLUMN "eligibleProviderAmount" TYPE DECIMAL(20,4) USING "eligibleProviderAmount"::numeric(20,4),
  ALTER COLUMN "gatewayDeductionAmount" TYPE DECIMAL(20,4) USING "gatewayDeductionAmount"::numeric(20,4),
  ALTER COLUMN "totalEarned" TYPE DECIMAL(20,4) USING "totalEarned"::numeric(20,4);

ALTER TABLE "platform_monthly_settlements"
  ALTER COLUMN "totalCommission" TYPE DECIMAL(20,4) USING "totalCommission"::numeric(20,4),
  ALTER COLUMN "totalConvenienceFee" TYPE DECIMAL(20,4) USING "totalConvenienceFee"::numeric(20,4),
  ALTER COLUMN "totalEarned" TYPE DECIMAL(20,4) USING "totalEarned"::numeric(20,4);

ALTER TABLE "jason_ledger_entries"
  ALTER COLUMN "amount" TYPE DECIMAL(20,4) USING "amount"::numeric(20,4),
  ALTER COLUMN "balanceBefore" TYPE DECIMAL(20,4) USING "balanceBefore"::numeric(20,4),
  ALTER COLUMN "balanceAfter" TYPE DECIMAL(20,4) USING "balanceAfter"::numeric(20,4);

ALTER TABLE "delivery_jobs"
  ALTER COLUMN "totalDeliveryFees" TYPE DECIMAL(20,4) USING "totalDeliveryFees"::numeric(20,4);
