/**
 * Read-only Nugegoda seed baseline / verification on DO Postgres (doadmin).
 */
const { requireDoadminDatabaseUrl } = require('./lib/load-doadmin-database-url.cjs');

process.env.DATABASE_URL = requireDoadminDatabaseUrl();

const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`SET search_path TO public, delivery`);

  const store = await prisma.store.findFirst({
    where: { name: { contains: 'Nugegoda' }, isActive: true },
    select: { id: true, name: true },
  });
  if (!store) {
    console.log(JSON.stringify({ error: 'Nugegoda store not found' }, null, 2));
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
