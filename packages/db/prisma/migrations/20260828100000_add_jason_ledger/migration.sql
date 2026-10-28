-- CreateEnum
CREATE TYPE "JasonLedgerType" AS ENUM ('INVESTMENT', 'EXPENSE');

-- CreateTable
CREATE TABLE "jason_ledger_entries" (
    "id" TEXT NOT NULL,
    "type" "JasonLedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jason_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jason_ledger_entries_type_occurredAt_idx" ON "jason_ledger_entries"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "jason_ledger_entries_occurredAt_idx" ON "jason_ledger_entries"("occurredAt");
