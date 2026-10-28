/**
 * Idempotent apply of refund bearer percentage fields (PostgreSQL).
 *
 * Usage: node packages/db/apply-refund-bearer-pct-migration.js
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
    const cols = [
      ['branchBearerPct', '"branchBearerPct" INTEGER'],
      ['customerBearerPct', '"customerBearerPct" INTEGER'],
      ['platformBearerPct', '"platformBearerPct" INTEGER'],
    ];

    for (const [col, ddl] of cols) {
      if (await columnExists(prisma, 'refunds', col)) {
        console.log(`[skip] refunds.${col} already exists`);
      } else {
        await prisma.$executeRawUnsafe(`ALTER TABLE "refunds" ADD COLUMN ${ddl}`);
        console.log(`[ok] refunds.${col} added`);
      }
    }

    console.log('Refund bearer percentage migration applied.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
