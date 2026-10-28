/**
 * backfill-platform-earnings.ts
 *
 * Credits platform earnings for all APPROVED withdrawals that do not yet
 * have a PlatformEarning row.
 *
 * Run: npx ts-node --transpile-only src/scripts/backfill-platform-earnings.ts
 */

import { PrismaClient } from '@prisma/client';
import { creditPlatformEarning } from '../lib/platformEarningsService';
import { computeBreakdownForPeriod } from '../lib/walletService';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

async function resolveWithdrawalPeriod(withdrawal: {
  id: string;
  storeId: string;
  periodFrom: Date | null;
  periodTo: Date | null;
  breakdown: unknown;
  walletTransactionId: string | null;
}) {
  let periodFrom = withdrawal.periodFrom;
  let periodTo = withdrawal.periodTo;
  let breakdown = withdrawal.breakdown;

  if ((!periodFrom || !periodTo) && withdrawal.walletTransactionId) {
    const payoutTxn = await prisma.walletTransaction.findUnique({
      where: { id: withdrawal.walletTransactionId },
      select: { periodFrom: true, periodTo: true },
    });
    periodFrom = periodFrom ?? payoutTxn?.periodFrom ?? null;
    periodTo = periodTo ?? payoutTxn?.periodTo ?? null;
  }

  if (periodFrom && periodTo) {
    const b = breakdown as { commissionFee?: number; convenienceFee?: number } | null;
    const hasAmounts =
      typeof b?.commissionFee === 'number' || typeof b?.convenienceFee === 'number';
    if (!hasAmounts) {
      breakdown = await computeBreakdownForPeriod(
        withdrawal.storeId,
        toDateStr(periodFrom),
        toDateStr(periodTo),
      );
    }
  }

  return { periodFrom, periodTo, breakdown };
}

async function main() {
  console.log('Starting platform earnings backfill...\n');

  const approvedWithdrawals = await prisma.storeWithdrawal.findMany({
    where: { status: 'APPROVED' },
    orderBy: [{ reviewedAt: 'asc' }, { createdAt: 'asc' }],
  });

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const withdrawal of approvedWithdrawals) {
    const existing = await prisma.platformEarning.findUnique({
      where: { storeWithdrawalId: withdrawal.id },
    });
    if (existing) {
      skipped++;
      continue;
    }

    try {
      const { periodFrom, periodTo, breakdown } = await resolveWithdrawalPeriod(withdrawal);
      await creditPlatformEarning({
        storeWithdrawalId: withdrawal.id,
        storeId: withdrawal.storeId,
        breakdown,
        periodFrom,
        periodTo,
        approvedAt: withdrawal.reviewedAt ?? withdrawal.updatedAt,
      });
      created++;
    } catch (err) {
      failed++;
      console.error(`Failed for withdrawal ${withdrawal.id}:`, (err as Error).message);
    }
  }

  console.log(`\nPlatform earnings backfill complete.`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (already exists): ${skipped}`);
  console.log(`  Failed: ${failed}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Backfill failed:', err.message ?? err);
  process.exit(1);
});
