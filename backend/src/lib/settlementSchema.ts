import { prisma } from './prisma';
import { addColumnIfMissing, createUniqueIndexIfMissing, execSql, tableHasColumn, tableHasConstraint } from './schemaPatch';

let settlementSchemaReady = false;

/** Ensures commission_settlements table exists (idempotent). */
export async function ensureCommissionSettlementTable(): Promise<void> {
  if (settlementSchemaReady) return;

  await addColumnIfMissing(
    'commission_settlements',
    'storeWithdrawalId',
    'VARCHAR(191) NULL',
  );
  await addColumnIfMissing('commission_settlements', 'invoiceRef', 'VARCHAR(191) NULL');
  await addColumnIfMissing('commission_settlements', 'invoiceUrl', 'VARCHAR(191) NULL');
  await addColumnIfMissing('commission_settlements', 'receiptUrl', 'TEXT NULL');
  if (await tableHasColumn('commission_settlements', 'receiptUrl')) {
    await execSql(
      `ALTER TABLE "commission_settlements" ALTER COLUMN "receiptUrl" TYPE TEXT USING "receiptUrl"::TEXT`,
    );
  }
  await createUniqueIndexIfMissing(
    'commission_settlements',
    'commission_settlements_storeWithdrawalId_key',
    '`storeWithdrawalId`',
  );

  if (await tableHasColumn('commission_settlements', 'storeWithdrawalId')) {
    const hasFk = await tableHasConstraint(
      'commission_settlements',
      'commission_settlements_storeWithdrawalId_fkey',
    );
    if (!hasFk) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "commission_settlements"
        ADD CONSTRAINT "commission_settlements_storeWithdrawalId_fkey"
        FOREIGN KEY ("storeWithdrawalId") REFERENCES "store_withdrawals"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
      `);
    }
  }

  settlementSchemaReady = true;
}
