import { prisma } from './prisma';
import { addColumnIfMissing, createIndexIfMissing, tableExists } from './schemaPatch';

const globalForPayback = globalThis as typeof globalThis & {
  __platformPaybackSchemaReady?: boolean;
};

/** Ensures platform discount payback columns and audit table exist (idempotent). */
export async function ensurePlatformPaybackSchema(): Promise<void> {
  if (globalForPayback.__platformPaybackSchemaReady) return;

  await addColumnIfMissing('stores', 'platformDiscountPaybackEnabled', 'BOOLEAN NOT NULL DEFAULT false');

  await addColumnIfMissing('promotion_usages', 'platformPaybackEligible', 'BOOLEAN NOT NULL DEFAULT false');
  await addColumnIfMissing('promotion_usages', 'platformPaybackAmount', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('promotion_usages', 'platformPaybackSettledAt', 'TIMESTAMP(3) NULL');
  await addColumnIfMissing('promotion_usages', 'platformPaybackWithdrawalId', 'VARCHAR(191) NULL');
  await addColumnIfMissing('promotion_usages', 'platformPaybackReversedAt', 'TIMESTAMP(3) NULL');
  await createIndexIfMissing(
    'promotion_usages',
    'promotion_usages_storeId_platformPaybackSettledAt_idx',
    'storeId, platformPaybackSettledAt',
  );

  await addColumnIfMissing('commission_settlements', 'platformPaybackAmount', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('platform_earnings', 'platformPaybackAmount', 'INTEGER NOT NULL DEFAULT 0');

  if (!(await tableExists('platform_payback_setting_logs'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "platform_payback_setting_logs" (
        "id" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "previousValue" BOOLEAN NOT NULL,
        "newValue" BOOLEAN NOT NULL,
        "changedById" TEXT NOT NULL,
        "changedByName" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "platform_payback_setting_logs_pkey" PRIMARY KEY ("id")
      )
    `);
    await createIndexIfMissing(
      'platform_payback_setting_logs',
      'platform_payback_setting_logs_storeId_createdAt_idx',
      'storeId, createdAt',
    );
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "platform_payback_setting_logs"
      ADD CONSTRAINT "platform_payback_setting_logs_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE
    `).catch(() => {
      // FK may already exist
    });
  }

  globalForPayback.__platformPaybackSchemaReady = true;
}
