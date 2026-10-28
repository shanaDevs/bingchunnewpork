-- Persist wallet-ready refund payment structure on complete

ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "returningSubtotal" INTEGER;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "notReturningSubtotal" INTEGER;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "returningDeliveryFee" INTEGER;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "returningConvenienceFee" INTEGER;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "nonRefundableDeliveryFee" INTEGER;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "nonRefundableConvenienceFee" INTEGER;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "additionalGatewayFee" INTEGER;
