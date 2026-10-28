/**
 * Idempotent apply of 20260818120000_add_refund_payment_fields (PostgreSQL).
 *
 * Usage: node packages/db/apply-refund-payment-fields-migration.js
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

async function enumExists(prisma, name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typname = $1`,
    name,
  );
  return Number(rows[0]?.c || 0) > 0;
}

async function indexExists(prisma, indexName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c
     FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = $1`,
    indexName,
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
    if (!(await enumExists(prisma, 'RefundPaymentStatus'))) {
      await prisma.$executeRawUnsafe(`
        CREATE TYPE "RefundPaymentStatus" AS ENUM ('UNPAID', 'PAYMENT_PROCESSING', 'PAID')
      `);
      console.log('[ok] RefundPaymentStatus enum created');
    } else {
      console.log('[skip] RefundPaymentStatus enum already exists');
    }

    const refundCols = [
      ['productSaleIncluded', '"productSaleIncluded" BOOLEAN'],
      ['deliveryFeeIncluded', '"deliveryFeeIncluded" BOOLEAN'],
      ['convenienceFeeIncluded', '"convenienceFeeIncluded" BOOLEAN'],
      ['deductionPercent', '"deductionPercent" DOUBLE PRECISION'],
      ['refundDeduction', '"refundDeduction" INTEGER'],
      ['penaltyAmount', '"penaltyAmount" INTEGER'],
      ['penaltyBranchPct', '"penaltyBranchPct" INTEGER'],
      ['penaltyBranchShare', '"penaltyBranchShare" INTEGER'],
      ['penaltyPlatformShare', '"penaltyPlatformShare" INTEGER'],
      ['gatewayFee', '"gatewayFee" INTEGER'],
      ['gatewayFeeBearer', '"gatewayFeeBearer" TEXT'],
      ['branchBears', '"branchBears" INTEGER'],
      ['platformBears', '"platformBears" INTEGER'],
      ['paymentStatus', '"paymentStatus" "RefundPaymentStatus"'],
      ['paidAt', '"paidAt" TIMESTAMP(3)'],
      ['paidByAdminId', '"paidByAdminId" TEXT'],
      ['paymentNote', '"paymentNote" TEXT'],
    ];

    for (const [col, ddl] of refundCols) {
      if (await columnExists(prisma, 'refunds', col)) {
        console.log(`[skip] refunds.${col} already exists`);
      } else {
        await prisma.$executeRawUnsafe(`ALTER TABLE "refunds" ADD COLUMN ${ddl}`);
        console.log(`[ok] refunds.${col} added`);
      }
    }

    if (await indexExists(prisma, 'refunds_paymentStatus_idx')) {
      console.log('[skip] refunds_paymentStatus_idx already exists');
    } else {
      await prisma.$executeRawUnsafe(
        'CREATE INDEX "refunds_paymentStatus_idx" ON "refunds"("paymentStatus")',
      );
      console.log('[ok] refunds_paymentStatus_idx created');
    }

    console.log('Refund payment fields migration applied.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
