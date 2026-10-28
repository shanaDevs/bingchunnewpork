/**
 * Idempotent apply of cancelReason / cancelledBy columns on orders.
 *
 * Usage: node packages/db/apply-cancel-reason-migration.js
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const candidates = [
    path.join(__dirname, '../../backend/.env'),
    path.join(__dirname, '../../delivery-service/.env'),
    path.join(__dirname, '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      if (process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
}

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column,
  );
  return Number(rows[0]?.c || 0) > 0;
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    if (!(await columnExists(prisma, 'orders', 'cancelReason'))) {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `orders` ADD COLUMN `cancelReason` ENUM('OUT_OF_STOCK', 'CUSTOMER_REQUEST', 'PAYMENT_OR_SYSTEM_ISSUE') NULL",
      );
      console.log('[ok] orders.cancelReason added');
    } else {
      console.log('[skip] orders.cancelReason already exists');
    }

    if (!(await columnExists(prisma, 'orders', 'cancelledBy'))) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `orders` ADD COLUMN `cancelledBy` VARCHAR(191) NULL',
      );
      console.log('[ok] orders.cancelledBy added');
    } else {
      console.log('[skip] orders.cancelledBy already exists');
    }

    const orders = await prisma.order.findMany({
      where: {
        status: { not: 'DELIVERED' },
        orderMode: 'TAKEAWAY',
        createdAt: {
          gte: new Date('2026-07-28T00:00:00'),
          lte: new Date('2026-07-28T23:59:59.999'),
        },
        AND: [{ OR: [{ paymentStatus: 'PAID' }, { paymentMethod: 'CASH_AT_COUNTER' }] }],
      },
      take: 1,
    });
    console.log(`[verify] sample query OK (${orders.length} row(s))`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
