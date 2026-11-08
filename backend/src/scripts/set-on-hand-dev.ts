/**
 * Dev helper: set branch on-hand to an exact qty via batch adjustments.
 *   npx ts-node --transpile-only src/scripts/set-on-hand-dev.ts --store=Nugegoda --qty=30 --product="Brown Sugar Boba Milk Tea"
 */
import path from 'path';
import dotenv from 'dotenv';
import { adjustBatch, receiveBatch } from '../lib/batchStockEngine';
import { prisma } from '../lib/prisma';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const DEFAULT_PRODUCTS = ['Brown Sugar Boba Milk Tea', 'Blueberry Bobo Tea'] as const;

function parseArgs() {
  let storeNeedle = 'Nugegoda';
  let qty = 30;
  const products: string[] = [];
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--store=')) storeNeedle = arg.slice('--store='.length);
    else if (arg.startsWith('--qty=')) qty = Number(arg.slice('--qty='.length)) || qty;
    else if (arg.startsWith('--product=')) products.push(arg.slice('--product='.length));
  }
  return { storeNeedle, qty, products: products.length > 0 ? products : [...DEFAULT_PRODUCTS] };
}

async function resolveStore(needle: string) {
  const store = await prisma.store.findFirst({
    where: {
      isActive: true,
      OR: [
        { name: { equals: `Bing Chun - ${needle}` } },
        { name: { contains: needle, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true },
  });
  if (!store) throw new Error(`Store not found for "${needle}"`);
  return store;
}

async function resolveAdminId(storeId: string): Promise<string> {
  const admin =
    (await prisma.adminUser.findFirst({
      where: { email: 'branch@bingchunsrilanka.lk', isActive: true },
      select: { id: true },
    })) ??
    (await prisma.adminUser.findFirst({
      where: { storeId, isActive: true, role: { name: 'STORE_MANAGER' } },
      select: { id: true },
    }));
  if (!admin) throw new Error('No branch admin for audit log — log in as branch manager once');
  return admin.id;
}

async function setProductOnHand(
  storeId: string,
  productId: string,
  productName: string,
  target: number,
  adminUserId: string,
): Promise<void> {
  const batches = await prisma.stockBatch.findMany({
    where: { storeId, productId, status: 'ACTIVE', remainingQty: { gt: 0 } },
    orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, remainingQty: true, batchNumber: true },
  });
  const onHand = batches.reduce((sum, b) => sum + b.remainingQty, 0);
  if (onHand === target) {
    console.log(`  ${productName}: already ${target}`);
    return;
  }

  if (onHand > target) {
    let toRemove = onHand - target;
    for (const batch of batches) {
      if (toRemove <= 0) break;
      const take = Math.min(batch.remainingQty, toRemove);
      await adjustBatch({
        batchId: batch.id,
        delta: -take,
        reason: `Dev set on-hand to ${target}`,
        adminUserId,
      });
      toRemove -= take;
      console.log(`  ${productName}: -${take} from ${batch.batchNumber}`);
    }
  } else {
    const add = target - onHand;
    await receiveBatch({
      storeId,
      productId,
      receivedQty: add,
      note: `Dev set on-hand to ${target}`,
      adminUserId,
    });
    console.log(`  ${productName}: +${add} (receive)`);
  }

  const row = await prisma.storeProduct.findUnique({
    where: { storeId_productId: { storeId, productId } },
    select: { stock: true, weeklyRemainingQty: true, isAvailable: true },
  });
  const batchCount = await prisma.stockBatch.count({
    where: { storeId, productId, status: 'ACTIVE', remainingQty: { gt: 0 } },
  });
  console.log(
    `  ${productName}: on hand ${row?.stock ?? '?'} (${batchCount} active batch/es) available=${row?.isAvailable}`,
  );
}

async function main() {
  assertDevSeedOnly();
  const { storeNeedle, qty, products: productNames } = parseArgs();
  const store = await resolveStore(storeNeedle);
  const adminUserId = await resolveAdminId(store.id);

  console.log(`Store: ${store.name}`);
  console.log(`Target on-hand: ${qty} for ${productNames.join(', ')}\n`);

  for (const name of productNames) {
    const product = await prisma.product.findFirst({
      where: { name: { equals: name } },
      select: { id: true, name: true },
    });
    if (!product) throw new Error(`Product not found: ${name}`);
    const sp = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
      select: { stock: true },
    });
    if (!sp) throw new Error(`No store_products row for ${name} at ${store.name}`);
    console.log(`${name} (before: ${sp.stock})`);
    await setProductOnHand(store.id, product.id, product.name, qty, adminUserId);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
