/**
 * Backfill opening batches for existing store_products rows with stock > 0.
 * Run: npx tsx backend/prisma/backfillBatches.ts
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function slugStoreCode(name: string): string {
  return name
    .replace(/Bing Chun\s*-?\s*/gi, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 6)
    .toUpperCase() || 'BRANCH';
}

async function ensureStoreCodes(): Promise<void> {
  const stores = await prisma.store.findMany({ select: { id: true, name: true, code: true } });
  for (const store of stores) {
    if (store.code) continue;
    let code = slugStoreCode(store.name);
    let suffix = 1;
    while (await prisma.store.findFirst({ where: { code, id: { not: store.id } } })) {
      code = `${slugStoreCode(store.name)}${suffix}`;
      suffix += 1;
    }
    await prisma.store.update({ where: { id: store.id }, data: { code } });
    console.log(`Store ${store.name} -> code ${code}`);
  }
}

async function backfillOpeningBatches(): Promise<void> {
  const rows = await prisma.storeProduct.findMany({
    where: { stock: { gt: 0 } },
    include: { store: { select: { code: true, name: true } } },
  });

  let created = 0;
  for (const row of rows) {
    const existingBatch = await prisma.stockBatch.findFirst({
      where: { storeId: row.storeId, productId: row.productId },
    });
    if (existingBatch) continue;

    const code = row.store.code ?? slugStoreCode(row.store.name);
    const dateKey = row.updatedAt.toISOString().slice(2, 10).replace(/-/g, '');
    const batchNumber = `OPEN-${code}-${dateKey}-${String(created + 1).padStart(3, '0')}`;

    await prisma.$transaction(async (tx) => {
      await tx.stockBatch.create({
        data: {
          id: randomUUID(),
          batchNumber,
          storeId: row.storeId,
          productId: row.productId,
          receivedQty: row.stock,
          remainingQty: row.stock,
          receivedAt: row.updatedAt,
          status: 'ACTIVE',
          note: 'Opening balance backfill',
        },
      });

      await tx.storeProduct.update({
        where: { storeId_productId: { storeId: row.storeId, productId: row.productId } },
        data: {
          weeklyRemainingQty: row.stock,
          weeklyTargetQty: row.weeklyBaseQty > 0 ? row.weeklyBaseQty : row.weeklyTargetQty,
        },
      });

      await tx.stockAuditLog.create({
        data: {
          id: randomUUID(),
          storeId: row.storeId,
          productId: row.productId,
          changeType: 'BATCH_RECEIVED',
          qtyBefore: 0,
          qtyChange: row.stock,
          qtyAfter: row.stock,
          note: `Opening batch ${batchNumber}`,
        },
      });
    });

    created += 1;
    console.log(`Created opening batch ${batchNumber} (${row.stock} units)`);
  }

  console.log(`Backfill complete: ${created} opening batches created`);
}

async function checkInvariants(): Promise<void> {
  const rows = await prisma.storeProduct.findMany({
    select: { storeId: true, productId: true, stock: true },
  });

  let mismatches = 0;
  for (const row of rows) {
    const sum = await prisma.stockBatch.aggregate({
      where: { storeId: row.storeId, productId: row.productId, status: 'ACTIVE' },
      _sum: { remainingQty: true },
    });
    const actual = sum._sum.remainingQty ?? 0;
    if (actual !== row.stock) {
      mismatches += 1;
      console.warn(`Mismatch store=${row.storeId} product=${row.productId}: cached=${row.stock} batches=${actual}`);
    }
  }

  if (mismatches === 0) {
    console.log('Invariant check passed');
  } else {
    console.warn(`Invariant check found ${mismatches} mismatches`);
  }
}

async function main() {
  await ensureStoreCodes();
  await backfillOpeningBatches();
  await checkInvariants();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
