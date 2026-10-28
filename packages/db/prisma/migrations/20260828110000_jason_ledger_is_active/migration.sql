-- AlterTable
ALTER TABLE "jason_ledger_entries" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
