-- AlterTable
ALTER TABLE "store_withdrawals" ADD COLUMN IF NOT EXISTS "invoiceData" JSONB;

-- AlterTable
ALTER TABLE "commission_settlements" ADD COLUMN IF NOT EXISTS "invoiceData" JSONB;
