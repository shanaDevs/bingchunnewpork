import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../lib/prisma';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  const hostMatch = url.match(/@([^:/]+)/);
  const host = hostMatch?.[1] ?? '(unknown)';
  const dbMatch = url.match(/\/([^/?]+)\?/);
  const dbName = dbMatch?.[1] ?? '(unknown)';

  const count = await prisma.order.count({
    where: { notes: { startsWith: 'seed-wallet-sept-' } },
  });
  const sample = await prisma.order.findMany({
    where: { notes: { startsWith: 'seed-wallet-sept-' } },
    select: { id: true, orderNumber: true, createdAt: true, storeId: true, notes: true },
    orderBy: { createdAt: 'asc' },
    take: 3,
  });
  const stores = await prisma.order.groupBy({
    by: ['storeId'],
    where: { notes: { startsWith: 'seed-wallet-sept-' } },
    _count: true,
  });

  console.log(JSON.stringify({ host, dbName, seedOrderCount: count, stores, sample }, null, 2));
}

main()
  .finally(() => prisma.$disconnect());
