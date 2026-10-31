/**
 * Read-only Nugegoda seed baseline / post-run verification.
 * Safe to run in shop-api Console (uses component DATABASE_URL / doadmin).
 */
import { prisma } from '../lib/prisma';

const STORE_NAME = process.env.SEED_TARGET_STORE_NAME ?? 'Nugegoda';

async function main(): Promise<void> {
  await prisma.$executeRawUnsafe(`SET search_path TO public, delivery`);

  const store = await prisma.store.findFirst({
    where: { name: { contains: STORE_NAME }, isActive: true },
    select: { id: true, name: true },
  });
  if (!store) {
    console.log(JSON.stringify({ error: `${STORE_NAME} store not found` }, null, 2));
    return;
  }

  const manager = await prisma.adminUser.findFirst({
    where: { storeId: store.id, isActive: true, role: { name: 'STORE_MANAGER' } },
    select: { id: true, email: true },
  });

  const seedOrders = await prisma.order.count({
    where: {
      storeId: store.id,
      OR: [
        { id: { startsWith: 'seed-' } },
        { notes: { startsWith: 'seed-' } },
        { notes: { startsWith: 'seed-nuge-app-' } },
      ],
    },
  });

  const nugeAppOrders = await prisma.order.count({
    where: { storeId: store.id, notes: { startsWith: 'seed-nuge-app-' } },
  });

  const deliveredNugeApp = await prisma.order.aggregate({
    where: {
      storeId: store.id,
      notes: { startsWith: 'seed-nuge-app-' },
      status: 'DELIVERED',
      paymentStatus: 'PAID',
    },
    _sum: { total: true },
    _count: true,
  });

  const refunds = await prisma.refund.groupBy({
    by: ['status'],
    where: { order: { storeId: store.id, notes: { startsWith: 'seed-nuge-app-' } } },
    _count: true,
  });

  const badFees = await prisma.order.count({
    where: { storeId: store.id, notes: { startsWith: 'seed-nuge-app-' }, convenientFee: { gt: 0 } },
  });

  const promos = await prisma.promoCode.count({
    where: { isActive: true, deletedAt: null },
  });

  const byMonth = await prisma.$queryRaw<
    { month: string; delivered_count: bigint; gmv: number | null }[]
  >`
    SELECT to_char(o."createdAt" AT TIME ZONE 'Asia/Colombo', 'YYYY-MM') AS month,
           COUNT(*)::bigint AS delivered_count,
           SUM(o.total)::float AS gmv
    FROM orders o
    WHERE o."storeId" = ${store.id}
      AND o.notes LIKE 'seed-nuge-app-%'
      AND o.status = 'DELIVERED'
      AND o."paymentStatus" = 'PAID'
    GROUP BY 1
    ORDER BY 1
  `;

  console.log(
    JSON.stringify(
      {
        store,
        storeManager: manager,
        activePromoCodes: promos,
        seedOrdersAtBranch: seedOrders,
        seedNugeAppOrders: nugeAppOrders,
        seedNugeAppDeliveredPaid: {
          count: deliveredNugeApp._count,
          totalLkr: deliveredNugeApp._sum.total ?? 0,
        },
        seedNugeAppDeliveredByMonthColombo: byMonth.map((r) => ({
          month: r.month,
          count: Number(r.delivered_count),
          gmvLkr: r.gmv ?? 0,
        })),
        seedNugeAppRefundsByStatus: refunds,
        seedNugeAppOrdersWithConvenienceFee: badFees,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
