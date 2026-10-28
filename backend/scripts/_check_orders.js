require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const total = await p.order.count();
  const byStatus = await p.order.groupBy({ by: ['status'], _count: true });
  const seed = await p.order.count({ where: { id: { startsWith: 'seed-nuge-jul26-' } } });
  const sample = await p.order.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      storeId: true,
      createdAt: true,
      paymentMethod: true,
      orderMode: true,
    },
  });
  const stores = await p.store.findMany({
    where: { name: { contains: 'Nugegoda' } },
    select: { id: true, name: true, isActive: true },
  });
  console.log(JSON.stringify({ total, seed, byStatus, sample, stores }, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
