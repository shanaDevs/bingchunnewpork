/**
 * backfill-wallets.ts
 * 
 * Backfills wallet balances and transactions from all PAID orders.
 * - Clears existing wallet_transactions for all stores
 * - Recalculates running balances per store in chronological order
 * - Inserts one wallet_transaction per paid order
 * - Resets store_wallets.balance to match total
 * 
 * Run: npx ts-node src/scripts/backfill-wallets.ts
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { centsToDecimal } from '../lib/moneyDecimal';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

async function main() {
  console.log('🔄  Starting wallet backfill from orders...\n');

  // ── 1. Get all PAID orders, ordered by store + createdAt ──────────────────
  const paidOrders = await prisma.order.findMany({
    where: {
      paymentStatus: 'PAID',
      paymentMethod: { in: ['CARD', 'PAYHERE'] },
    },
    select: {
      id: true,
      orderNumber: true,
      storeId: true,
      total: true,
      subtotal: true,
      deliveryFee: true,
      discount: true,
      loyaltyDiscount: true,
      paymentMethod: true,
      paymentRef: true,
      orderMode: true,
      createdAt: true,
    },
    orderBy: [{ storeId: 'asc' }, { createdAt: 'asc' }],
  });

  console.log(`✅  Found ${paidOrders.length} paid order(s) to process\n`);

  if (paidOrders.length === 0) {
    console.log('⚠️   No paid orders found. Nothing to backfill.');
    await prisma.$disconnect();
    return;
  }

  // ── 2. Group orders by store ───────────────────────────────────────────────
  const byStore = new Map<string, typeof paidOrders>();
  for (const order of paidOrders) {
    if (!byStore.has(order.storeId)) byStore.set(order.storeId, []);
    byStore.get(order.storeId)!.push(order);
  }

  // ── 3. Clear all existing wallet transactions & reset balances ────────────
  console.log('🗑️   Clearing existing wallet transactions...');
  await prisma.walletTransaction.deleteMany({});
  console.log('    Done.\n');

  // ── 4. Process each store ─────────────────────────────────────────────────
  let grandTotalProcessed = 0;

  for (const [storeId, orders] of byStore.entries()) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });
    console.log(`\n🏪  ${store?.name ?? storeId} (${orders.length} order(s))`);

    // Ensure wallet exists
    await prisma.storeWallet.upsert({
      where: { storeId },
      create: { id: crypto.randomUUID(), storeId, balance: centsToDecimal(0) },
      update: { balance: centsToDecimal(0) }, // reset to recalculate
    });

    let runningBalance = 0;
    const transactions = [];

    for (const order of orders) {
      const orderTotalCents = order.total * 100;
      runningBalance += orderTotalCents;

      const desc = [
        `Order #${order.orderNumber}`,
        `(${order.orderMode})`,
        order.subtotal !== order.total
          ? `Subtotal: ${order.subtotal} | Delivery: ${order.deliveryFee} | Discount: ${order.discount + order.loyaltyDiscount}`
          : null,
        order.paymentRef ? `Ref: ${order.paymentRef}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      transactions.push({
        id: crypto.randomUUID(),
        storeId,
        orderId: order.id,
        type: 'ORDER_PAYMENT' as const,
        amount: centsToDecimal(orderTotalCents),
        balanceAfter: centsToDecimal(runningBalance),
        paymentMethod: order.paymentMethod,
        paymentRef: order.paymentRef ?? null,
        description: desc,
        reference: order.orderNumber,
        createdById: null,
        createdAt: order.createdAt,
      });

      console.log(`    ✅  #${order.orderNumber}  LKR ${(order.total).toFixed(2)} → running balance: LKR ${(runningBalance / 100).toFixed(2)}`);
    }

    // Insert all transactions for this store
    await prisma.walletTransaction.createMany({ data: transactions });

    // Update wallet balance
    await prisma.storeWallet.update({
      where: { storeId },
      data: {
        balance: centsToDecimal(runningBalance),
        totalEarnings: centsToDecimal(runningBalance),
      },
    });

    console.log(`    💰  Final balance: LKR ${(runningBalance / 100).toFixed(2)}`);
    grandTotalProcessed += runningBalance;
  }

  // ── 5. Zero out wallets for stores with no paid orders ────────────────────
  const allStores = await prisma.store.findMany({ select: { id: true } });
  for (const store of allStores) {
    if (!byStore.has(store.id)) {
      await prisma.storeWallet.upsert({
        where: { storeId: store.id },
        create: { id: crypto.randomUUID(), storeId: store.id, balance: centsToDecimal(0) },
        update: { balance: centsToDecimal(0) },
      });
    }
  }

  console.log(`\n${'─'.repeat(55)}`);
  console.log(`✅  Backfill complete!`);
  console.log(`    Stores processed   : ${byStore.size}`);
  console.log(`    Orders processed   : ${paidOrders.length}`);
  console.log(`    Grand total revenue: LKR ${(grandTotalProcessed / 100).toFixed(2)}`);
  console.log(`${'─'.repeat(55)}\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('\n❌  Backfill failed:', e.message ?? e);
  process.exit(1);
});
