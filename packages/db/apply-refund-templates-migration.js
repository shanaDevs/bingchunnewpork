/**
 * Idempotent apply of refund_templates table (PostgreSQL).
 *
 * Usage: node packages/db/apply-refund-templates-migration.js
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

async function tableExists(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    table,
  );
  return Number(rows[0]?.c || 0) > 0;
}

const SEED_TEMPLATES = [
  {
    id: 'tpl-full-refund',
    name: 'Full Refund',
    description: '100% product and delivery, all fees included, penalty borne by branch.',
    sortOrder: 0,
    includeProductSale: true,
    includeDeliveryFee: true,
    includeConvenienceFee: true,
    includeGatewayFee: true,
    refundAmountPercent: 100,
    applyPenalty: true,
    branchBearerPct: 100,
    customerBearerPct: 0,
    platformBearerPct: 0,
  },
  {
    id: 'tpl-partial-window',
    name: 'Partial After Window',
    description: '100% product and delivery only; no convenience or gateway; customer bears penalty share.',
    sortOrder: 1,
    includeProductSale: true,
    includeDeliveryFee: true,
    includeConvenienceFee: false,
    includeGatewayFee: false,
    refundAmountPercent: 100,
    applyPenalty: true,
    branchBearerPct: 0,
    customerBearerPct: 100,
    platformBearerPct: 0,
  },
  {
    id: 'tpl-no-penalty',
    name: 'No Penalty',
    description: '100% refund with no penalty applied.',
    sortOrder: 2,
    includeProductSale: true,
    includeDeliveryFee: true,
    includeConvenienceFee: true,
    includeGatewayFee: false,
    refundAmountPercent: 100,
    applyPenalty: false,
    branchBearerPct: 100,
    customerBearerPct: 0,
    platformBearerPct: 0,
  },
];

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    if (await tableExists(prisma, 'refund_templates')) {
      console.log('[skip] refund_templates table already exists');
    } else {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "refund_templates" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "sortOrder" INTEGER NOT NULL DEFAULT 0,
          "includeProductSale" BOOLEAN NOT NULL DEFAULT true,
          "includeDeliveryFee" BOOLEAN NOT NULL DEFAULT true,
          "includeConvenienceFee" BOOLEAN NOT NULL DEFAULT true,
          "includeGatewayFee" BOOLEAN NOT NULL DEFAULT false,
          "refundAmountPercent" INTEGER NOT NULL DEFAULT 100,
          "applyPenalty" BOOLEAN NOT NULL DEFAULT true,
          "branchBearerPct" INTEGER NOT NULL DEFAULT 100,
          "customerBearerPct" INTEGER NOT NULL DEFAULT 0,
          "platformBearerPct" INTEGER NOT NULL DEFAULT 0,
          "createdByAdminId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "refund_templates_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX "refund_templates_name_key" ON "refund_templates"("name")`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX "refund_templates_isActive_sortOrder_idx" ON "refund_templates"("isActive", "sortOrder")`,
      );
      console.log('[ok] refund_templates table created');
    }

    for (const tpl of SEED_TEMPLATES) {
      const existing = await prisma.$queryRawUnsafe(
        `SELECT "id" FROM "refund_templates" WHERE "id" = $1 LIMIT 1`,
        tpl.id,
      );
      if (existing.length > 0) {
        console.log(`[skip] seed template ${tpl.id} already exists`);
        continue;
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "refund_templates" (
          "id", "name", "description", "isActive", "sortOrder",
          "includeProductSale", "includeDeliveryFee", "includeConvenienceFee", "includeGatewayFee",
          "refundAmountPercent", "applyPenalty",
          "branchBearerPct", "customerBearerPct", "platformBearerPct",
          "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, true, $4,
          $5, $6, $7, $8,
          $9, $10,
          $11, $12, $13,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`,
        tpl.id,
        tpl.name,
        tpl.description,
        tpl.sortOrder,
        tpl.includeProductSale,
        tpl.includeDeliveryFee,
        tpl.includeConvenienceFee,
        tpl.includeGatewayFee,
        tpl.refundAmountPercent,
        tpl.applyPenalty,
        tpl.branchBearerPct,
        tpl.customerBearerPct,
        tpl.platformBearerPct,
      );
      console.log(`[ok] seed template ${tpl.name} inserted`);
    }

    console.log('Refund templates migration applied.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
