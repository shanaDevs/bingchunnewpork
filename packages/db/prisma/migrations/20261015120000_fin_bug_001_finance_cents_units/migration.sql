-- FIN-BUG-001: All finance Decimal(20,4) columns store integer cents.
-- delivery_jobs.totalDeliveryFees was whole LKR; delivery_payouts.amount was whole/fractional LKR at Decimal(14,4).

UPDATE delivery."delivery_jobs"
SET "totalDeliveryFees" = ROUND("totalDeliveryFees" * 100, 0)
WHERE "totalDeliveryFees" IS NOT NULL;

ALTER TABLE delivery."delivery_payouts"
  ALTER COLUMN "amount" TYPE DECIMAL(20,4)
  USING ROUND("amount" * 100, 0)::numeric(20,4);
