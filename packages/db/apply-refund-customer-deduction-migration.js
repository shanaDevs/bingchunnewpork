/**
 * Idempotent apply of refund customerDeduction field (PostgreSQL).
 *
 * Usage: node packages/db/apply-refund-customer-deduction-migration.js
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const candidates = [
    path.join(__dirname, '../../backend/.env'),
    path.join(__dirname, '../../.env'),
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
    if (process.env.DATABASE_URL) break;
  }
}

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
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
    if (await columnExists(prisma, 'refunds', 'customerDeduction')) {
      console.log('[skip] refunds.customerDeduction already exists');
    } else {
      await prisma.$executeRawUnsafe(`ALTER TABLE "refunds" ADD COLUMN "customerDeduction" INTEGER`);
      console.log('[ok] refunds.customerDeduction added');
    }

    console.log('Refund customerDeduction migration applied.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
