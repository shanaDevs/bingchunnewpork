/**
 * Read-only Nugegoda seed baseline / verification on DO Postgres.
 * Uses same URL loading as audit-delivery-portal-readonly.cjs
 */
const fs = require('fs');
const path = require('path');

const secretsPath = path.join(__dirname, 'secrets.env');
const doadminUrlPath = path.join(__dirname, 'audit-doadmin.url');

function loadPublicDatabaseUrl() {
  if (process.env.AUDIT_DATABASE_URL) return process.env.AUDIT_DATABASE_URL;
  if (fs.existsSync(doadminUrlPath)) {
    const line = fs
      .readFileSync(doadminUrlPath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    if (line) {
      const parsed = new URL(line);
      if (parsed.hostname.startsWith('private-')) {
        parsed.hostname = parsed.hostname.slice('private-'.length);
      }
      return parsed.toString();
    }
  }
  const text = fs.readFileSync(secretsPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
    if (!m) continue;
    let url = m[1].trim();
    if (
      (url.startsWith('"') && url.endsWith('"')) ||
      (url.startsWith("'") && url.endsWith("'"))
    ) {
      url = url.slice(1, -1);
    }
    const parsed = new URL(url);
    if (parsed.hostname.startsWith('private-')) {
      parsed.hostname = parsed.hostname.slice('private-'.length);
    }
    return parsed.toString();
  }
  throw new Error('DATABASE_URL not found in secrets.env or audit-doadmin.url');
}

process.env.DATABASE_URL = loadPublicDatabaseUrl();

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
