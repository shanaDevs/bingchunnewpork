import { prisma } from './prisma';
import { addColumnIfMissing, tableHasColumn, tableHasIndex, tableHasConstraint } from './schemaPatch';

let platformEarningsSchemaReady = false;

/** Ensures platform_earnings and platform_monthly_settlements tables exist (idempotent). */
export async function ensurePlatformEarningsSchema(): Promise<void> {
  if (platformEarningsSchemaReady) return;

  await addColumnIfMissing('platform_earnings', 'settlementId', 'VARCHAR(191) NULL');
  await addColumnIfMissing(
    'platform_earnings',
    'sharedPromoContributionAmount',
    'DECIMAL(20,4) NOT NULL DEFAULT 0',
  );
  await addColumnIfMissing(
    'platform_earnings',
    'loyaltyDiscountAmount',
    'DECIMAL(20,4) NOT NULL DEFAULT 0',
  );
  await addColumnIfMissing(
    'platform_earnings',
    'netPlatformCommissionAmount',
    'DECIMAL(20,4) NOT NULL DEFAULT 0',
  );
  await addColumnIfMissing(
    'platform_earnings',
    'completedRefundConvenienceAmount',
    'DECIMAL(20,4) NOT NULL DEFAULT 0',
  );
  await addColumnIfMissing(
    'platform_earnings',
    'rejectedRefundConvenienceAmount',
    'DECIMAL(20,4) NOT NULL DEFAULT 0',
  );
  await addColumnIfMissing(
    'platform_earnings',
    'netPlatformEarningsAmount',
    'DECIMAL(20,4) NOT NULL DEFAULT 0',
  );
  await addColumnIfMissing(
    'platform_earnings',
    'eligibleProviderAmount',
    'DECIMAL(20,4) NOT NULL DEFAULT 0',
  );
  await addColumnIfMissing(
    'platform_earnings',
    'gatewayDeductionAmount',
    'DECIMAL(20,4) NOT NULL DEFAULT 0',
  );
  if (!(await tableHasIndex('platform_earnings', 'platform_earnings_settlementId_idx'))) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX "platform_earnings_settlementId_idx" ON "platform_earnings" ("settlementId")',
    );
  }

  if (await tableHasColumn('platform_earnings', 'settlementId')) {
    const hasFk = await tableHasConstraint(
      'platform_earnings',
      'platform_earnings_settlementId_fkey',
    );
    if (!hasFk) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "platform_earnings"
        ADD CONSTRAINT "platform_earnings_settlementId_fkey"
        FOREIGN KEY ("settlementId") REFERENCES "platform_monthly_settlements"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
      `);
    }
  }

  platformEarningsSchemaReady = true;
}
