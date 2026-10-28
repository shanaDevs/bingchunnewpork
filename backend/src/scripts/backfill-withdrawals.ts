/**
 * backfill-withdrawals.ts
 *
 * - Backfills store_withdrawals from existing PAYOUT wallet transactions
 * - Recomputes totalEarnings / totalWithdrawn / balance caches per store
 *
 * Run: npx ts-node src/scripts/backfill-withdrawals.ts
 */

import { Prisma, PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { centsToDecimal, decimalFieldToCentsNumber, parseDecimalFromDb } from '../lib/moneyDecimal';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

async function refreshWalletCaches(storeId: string) {
  const txns = await prisma.walletTransaction.findMany({
    where: { storeId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  let balance = 0;
  let totalEarnings = 0;
  let totalWithdrawn = 0;

  for (const txn of txns) {
    const amt = decimalFieldToCentsNumber(txn.amount);
    balance += amt;
    if (
      (['ORDER_PAYMENT', 'ORDER_ADDON_PAYMENT'].includes(txn.type) && amt > 0) ||
      (txn.type === 'ADJUSTMENT' && amt > 0)
    ) {
      totalEarnings += amt;
    }
    if (txn.type === 'PAYOUT' && amt < 0) {
      totalWithdrawn += Math.abs(amt);
    }
    const storedAfter = decimalFieldToCentsNumber(txn.balanceAfter);
    if (storedAfter !== balance) {
      await prisma.walletTransaction.update({
        where: { id: txn.id },
        data: { balanceAfter: centsToDecimal(balance) },
      });
    }
  }

  await prisma.storeWallet.upsert({
    where: { storeId },
    create: {
      id: crypto.randomUUID(),
      storeId,
      balance: centsToDecimal(balance),
      totalEarnings: centsToDecimal(totalEarnings),
      totalWithdrawn: centsToDecimal(totalWithdrawn),
    },
    update: {
      balance: centsToDecimal(balance),
      totalEarnings: centsToDecimal(totalEarnings),
      totalWithdrawn: centsToDecimal(totalWithdrawn),
    },
  });
}

async function main() {
  console.log('Starting withdrawal + wallet cache backfill...\n');

  const payoutTxns = await prisma.walletTransaction.findMany({
    where: { type: 'PAYOUT' },
    orderBy: { createdAt: 'asc' },
  });

  let created = 0;
  let skipped = 0;

  for (const txn of payoutTxns) {
    const existing = await prisma.storeWithdrawal.findFirst({
      where: { walletTransactionId: txn.id },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.storeWithdrawal.create({
      data: {
        id: crypto.randomUUID(),
        storeId: txn.storeId,
        amount: centsToDecimal(Math.abs(decimalFieldToCentsNumber(txn.amount))),
        status: 'APPROVED',
        remarks: txn.description,
        requestedById: txn.createdById ?? 'system',
        reviewedById: txn.createdById,
        reviewedAt: txn.createdAt,
        walletTransactionId: txn.id,
        createdAt: txn.createdAt,
      },
    });
    created++;
  }

  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  for (const store of stores) {
    await refreshWalletCaches(store.id);
    const wallet = await prisma.storeWallet.findUnique({ where: { storeId: store.id } });
    console.log(
      `  ${store.name}: balance=${(decimalFieldToCentsNumber(wallet?.balance) / 100).toFixed(2)} earnings=${(decimalFieldToCentsNumber(wallet?.totalEarnings) / 100).toFixed(2)} withdrawn=${(decimalFieldToCentsNumber(wallet?.totalWithdrawn) / 100).toFixed(2)}`,
    );
  }

  console.log(`\nWithdrawal records created: ${created}, skipped: ${skipped}`);
  console.log('Backfill complete.\n');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Backfill failed:', e.message ?? e);
  process.exit(1);
});
