/**
 * Idempotent apply of 20260818180000_simplify_refund_system (PostgreSQL).
 *
 * Usage: node packages/db/apply-simplify-refund-system-migration.js
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

async function tableExists(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    table,
  );
  return Number(rows[0]?.c || 0) > 0;
}

async function enumLabelExists(prisma, enumName, label) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c
     FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = $1 AND e.enumlabel = $2`,
    enumName,
    label,
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
    if (await tableExists(prisma, 'refund_status_events')) {
      await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "refund_status_events"');
      console.log('[ok] dropped refund_status_events');
    } else {
      console.log('[skip] refund_status_events already absent');
    }

    if (await tableExists(prisma, 'refund_templates')) {
      await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "refund_templates"');
      console.log('[ok] dropped refund_templates');
    } else {
      console.log('[skip] refund_templates already absent');
    }

    const newCols = [
      ['cancelledWithinWindow', '"cancelledWithinWindow" BOOLEAN NOT NULL DEFAULT false'],
      ['salesTotal', '"salesTotal" INTEGER'],
      ['deliveryFee', '"deliveryFee" INTEGER NOT NULL DEFAULT 0'],
      ['convenienceFee', '"convenienceFee" INTEGER NOT NULL DEFAULT 0'],
      ['orderTotal', '"orderTotal" INTEGER'],
      ['refundPercentage', '"refundPercentage" DOUBLE PRECISION'],
      ['refundAmount', '"refundAmount" INTEGER'],
    ];

    for (const [col, ddl] of newCols) {
      if (await columnExists(prisma, 'refunds', col)) {
        console.log(`[skip] refunds.${col} already exists`);
      } else {
        await prisma.$executeRawUnsafe(`ALTER TABLE "refunds" ADD COLUMN ${ddl}`);
        console.log(`[ok] refunds.${col} added`);
      }
    }

    const hasRefundTier = await columnExists(prisma, 'refunds', 'refundTier');
    const hasApprovedAmount = await columnExists(prisma, 'refunds', 'approvedAmount');
    const hasRequestedAmount = await columnExists(prisma, 'refunds', 'requestedAmount');

    if (hasRefundTier || hasApprovedAmount || hasRequestedAmount) {
      const refundTierExpr = hasRefundTier ? `r."refundTier" = 'full'` : 'false';
      const refundAmountExpr = [
        hasApprovedAmount ? 'r."approvedAmount"' : null,
        hasRequestedAmount ? 'r."requestedAmount"' : null,
      ].filter(Boolean).join(', ');

      await prisma.$executeRawUnsafe(`
        UPDATE "refunds" r
        SET
          "orderTotal" = COALESCE(r."orderTotal", o."total"),
          "salesTotal" = COALESCE(
            r."salesTotal",
            GREATEST(0, o."subtotal" - o."discount" - o."loyaltyDiscount")
          ),
          "deliveryFee" = COALESCE(r."deliveryFee", o."deliveryFee"),
          "convenienceFee" = COALESCE(r."convenienceFee", o."convenientFee"),
          "refundAmount" = COALESCE(r."refundAmount"${refundAmountExpr ? `, ${refundAmountExpr}` : ''}),
          "cancelledWithinWindow" = CASE
            WHEN ${refundTierExpr} THEN true
            ELSE false
          END
        FROM "orders" o
        WHERE o."id" = r."orderId"
      `);
      console.log('[ok] backfilled refund columns from orders and legacy fields');
    } else {
      await prisma.$executeRawUnsafe(`
        UPDATE "refunds" r
        SET
          "orderTotal" = COALESCE(r."orderTotal", o."total"),
          "salesTotal" = COALESCE(
            r."salesTotal",
            GREATEST(0, o."subtotal" - o."discount" - o."loyaltyDiscount")
          ),
          "deliveryFee" = COALESCE(r."deliveryFee", o."deliveryFee"),
          "convenienceFee" = COALESCE(r."convenienceFee", o."convenientFee")
        FROM "orders" o
        WHERE o."id" = r."orderId"
          AND (r."orderTotal" IS NULL OR r."salesTotal" IS NULL)
      `);
      console.log('[ok] backfilled refund columns from orders');
    }

    await prisma.$executeRawUnsafe(`
      UPDATE "refunds"
      SET
        "orderTotal" = COALESCE("orderTotal", 0),
        "salesTotal" = COALESCE("salesTotal", 0)
      WHERE "orderTotal" IS NULL OR "salesTotal" IS NULL
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "refunds" ALTER COLUMN "salesTotal" SET NOT NULL
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "refunds" ALTER COLUMN "orderTotal" SET NOT NULL
    `);

    const oldCols = [
      'refundTier',
      'requestedAmount',
      'approvedAmount',
      'paymentMethod',
      'paymentRef',
      'refundRef',
      'productSaleIncluded',
      'deliveryFeeIncluded',
      'convenienceFeeIncluded',
      'includeGatewayFee',
      'additionalCostBearer',
      'deductionPercent',
      'refundDeduction',
      'penaltyBranchPct',
      'penaltyBranchShare',
      'penaltyPlatformShare',
      'gatewayFee',
      'gatewayFeeBearer',
      'branchBears',
      'platformBears',
      'customerDeduction',
      'branchBearerPct',
      'customerBearerPct',
      'platformBearerPct',
      'paymentStatus',
    ];

    for (const col of oldCols) {
      if (await columnExists(prisma, 'refunds', col)) {
        await prisma.$executeRawUnsafe(`ALTER TABLE "refunds" DROP COLUMN "${col}"`);
        console.log(`[ok] dropped refunds.${col}`);
      }
    }

    await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "refunds_paymentStatus_idx"');

    const hasReceived = await enumLabelExists(prisma, 'RefundStatus', 'RECEIVED');
    if (!hasReceived) {
      await prisma.$executeRawUnsafe('ALTER TYPE "RefundStatus" RENAME TO "RefundStatus_old"');
      await prisma.$executeRawUnsafe(`
        CREATE TYPE "RefundStatus" AS ENUM ('RECEIVED', 'COMPLETE', 'REJECTED', 'PAID')
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "refunds" ALTER COLUMN "status" DROP DEFAULT
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "refunds"
          ALTER COLUMN "status" TYPE "RefundStatus"
          USING (
            CASE "status"::text
              WHEN 'REQUESTED' THEN 'RECEIVED'
              WHEN 'PROCESSING' THEN 'RECEIVED'
              WHEN 'COMPLETED' THEN 'COMPLETE'
              WHEN 'REJECTED' THEN 'REJECTED'
              ELSE 'RECEIVED'
            END
          )::"RefundStatus"
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "refunds" ALTER COLUMN "status" SET DEFAULT 'RECEIVED'
      `);
      await prisma.$executeRawUnsafe('DROP TYPE "RefundStatus_old"');
      console.log('[ok] RefundStatus enum migrated');
    } else {
      console.log('[skip] RefundStatus enum already migrated');
    }

    await prisma.$executeRawUnsafe('DROP TYPE IF EXISTS "RefundPaymentStatus"');
    console.log('Simplified refund system migration applied.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
