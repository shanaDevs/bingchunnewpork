import { prisma } from './prisma';
import { addColumnIfMissing, createIndexIfMissing, ensureEnumTypeIfMissing, tableExists } from './schemaPatch';

let jasonLedgerSchemaReady = false;

export async function ensureJasonLedgerSchema(): Promise<void> {
  if (jasonLedgerSchemaReady) return;

  await ensureEnumTypeIfMissing('JasonLedgerType', ['INVESTMENT', 'EXPENSE']);

  if (!(await tableExists('jason_ledger_entries'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "jason_ledger_entries" (
        "id" TEXT NOT NULL,
        "type" "JasonLedgerType" NOT NULL,
        "amount" DECIMAL(20,4) NOT NULL,
        "description" TEXT NOT NULL,
        "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "jason_ledger_entries_pkey" PRIMARY KEY ("id")
      )
    `);
  }

  await addColumnIfMissing('jason_ledger_entries', 'isActive', 'BOOLEAN NOT NULL DEFAULT true');
  await addColumnIfMissing('jason_ledger_entries', 'storeId', 'TEXT NULL');
  await addColumnIfMissing('jason_ledger_entries', 'storeWithdrawalId', 'TEXT NULL');
  await addColumnIfMissing('jason_ledger_entries', 'balanceBefore', 'DECIMAL(20,4) NULL');
  await addColumnIfMissing('jason_ledger_entries', 'balanceAfter', 'DECIMAL(20,4) NULL');

  await createIndexIfMissing(
    'jason_ledger_entries',
    'jason_ledger_entries_storeWithdrawalId_idx',
    'storeWithdrawalId',
  );

  await createIndexIfMissing(
    'jason_ledger_entries',
    'jason_ledger_entries_type_occurredAt_idx',
    'type, occurredAt',
  );
  await createIndexIfMissing(
    'jason_ledger_entries',
    'jason_ledger_entries_occurredAt_idx',
    'occurredAt',
  );

  jasonLedgerSchemaReady = true;
}
