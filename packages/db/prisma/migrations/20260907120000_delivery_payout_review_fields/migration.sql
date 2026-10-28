-- Delivery payout review fields (superadmin approve / reject + payment proof)
ALTER TABLE "delivery_payouts" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "delivery_payouts" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "delivery_payouts" ADD COLUMN IF NOT EXISTS "proofUrl" TEXT;
ALTER TABLE "delivery_payouts" ADD COLUMN IF NOT EXISTS "checkNumber" TEXT;
ALTER TABLE "delivery_payouts" ADD COLUMN IF NOT EXISTS "checkDate" TIMESTAMP(3);
ALTER TABLE "delivery_payouts" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "delivery_payouts" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
