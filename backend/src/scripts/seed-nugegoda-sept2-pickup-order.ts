/**
 * One PAID online PICKUP (TAKEAWAY) order at Nugegoda with loyalty points discount,
 * backdated to 2 September (Colombo).
 *
 *   npm run seed:nuge-sept2-pickup -w @bingchun/backend
 *   npm run seed:nuge-sept2-pickup -w @bingchun/backend -- --year=2026 --clean
 */
import crypto from 'crypto';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import type { OrderMode, PaymentMethod } from '@prisma/client';
import { placeOrder } from '../controllers/orderController';
import { markOnlineOrderPaid } from '../lib/onlineOrderPayment';
import { updatePaymentSettings } from '../lib/paymentSettings';
import { prisma } from '../lib/prisma';
import { syncStoreProducts } from '../lib/storeInventory';
import { recalculateWalletBalance } from '../lib/walletSync';
import { normalizePhone } from '../utils/phone';
import { runHandler, type HarnessUser } from './lib/seedControllerHarness';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const SEED_NOTE = 'seed-nuge-sept2-pickup-';
const SEPT_DAY = 2;
const SEPT_MONTH = 9;
const WALK_IN_PHONE = '0771000402';
const LOYALTY_POINTS_TO_USE = 200;
const WEEKLY_TARGET_QTY = 80;
const RESET_QTY = 2000;

type StoreRow = {
  id: string;
  name: string;
  city: string;
  district: string;
  lat: number;
  lng: number;
  code: string | null;
  isActive: boolean;
  deliveryEnabled: boolean;
};

type ProductPick = { productId: string; name: string; basePrice: number };

type Actors = {
  customer: HarnessUser & { type: 'user' };
  customerId: string;
};

const storeSelect = {
  id: true,
  name: true,
  city: true,
  district: true,
  lat: true,
  lng: true,
  code: true,
  isActive: true,
  deliveryEnabled: true,
} as const;

function parseArgs() {
  let year = 2026;
  const clean = process.argv.includes('--clean');
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--year=')) year = Number(arg.split('=')[1]) || year;
  }
  return { year, clean };
}

function placedInColombo(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');
  return new Date(`${year}-${mm}-${dd}T${hh}:${min}:00+05:30`);
}

/** Checkout requires a future slot; backdate via shiftTimelines after placement. */
function takeawaySchedulingNow(): { scheduleMode: 15; scheduledAt: string } {
  const scheduledAt = new Date(Date.now() + 25 * 60 * 1000).toISOString();
  return { scheduleMode: 15, scheduledAt };
}

async function ensureOnlineCheckoutEnabled(): Promise<void> {
  await updatePaymentSettings({
    activeOnlineGateway: 'PAYHERE',
    payhereMode: 'sandbox',
    payhereMerchantId: '1225599',
    payhereMerchantSecret: 'sandboxsecretkey123',
    paymentMethods: {
      PAYHERE: {
        enabled: true,
        label: 'Online Payment',
        modes: ['DELIVERY', 'TAKEAWAY'],
      },
      CARD: { enabled: false, label: 'Online Payment', modes: ['DELIVERY', 'TAKEAWAY'] },
      CASH_AT_COUNTER: { enabled: false, label: 'Cash at Counter', modes: ['TAKEAWAY'] },
    },
  });
}

async function resolveNugegoda(): Promise<StoreRow> {
  const store = await prisma.store.findFirst({
    where: {
      isActive: true,
      OR: [
        { name: { equals: 'Bing Chun - Nugegoda' } },
        { name: { contains: 'Nugegoda', mode: 'insensitive' } },
      ],
    },
    select: storeSelect,
  });
  if (!store) throw new Error('Bing Chun - Nugegoda not found — run seed:stores first');
  return store;
}

async function ensureActors(): Promise<Actors> {
  const seedPhone = normalizePhone(WALK_IN_PHONE);
  const email = 'seed.nuge.sept2@bingchun-test.lk';
  let user = await prisma.user.findFirst({ where: { OR: [{ phone: seedPhone }, { email }] } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Sept 2 Pickup Seed',
        phone: seedPhone,
        email,
        passwordHash: await bcrypt.hash('Customer@123', 10),
        isPhoneVerified: true,
      },
    });
  }
  return {
    customerId: user.id,
    customer: { sub: user.id, type: 'user' },
  };
}

async function ensureLoyaltyRedeemReady(userId: string, before: Date): Promise<void> {
  const bootstrapNote = `${SEED_NOTE}bootstrap-earn`;
  const hasBootstrap = await prisma.loyaltyTransaction.findFirst({
    where: { userId, note: bootstrapNote },
  });
  if (!hasBootstrap) {
    await prisma.loyaltyTransaction.create({
      data: {
        userId,
        points: 500,
        type: 'EARN',
        note: bootstrapNote,
        createdAt: new Date(before.getTime() - 30 * 86400000),
      },
    });
  }
  await prisma.user.update({
    where: { id: userId },
    data: { loyaltyPoints: Math.max(LOYALTY_POINTS_TO_USE + 100, 500) },
  });
}

function batchDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const yy = parts.find((p) => p.type === 'year')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'month')?.value ?? '01';
  const dd = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${yy}${mm}${dd}`;
}

function slugStoreCode(name: string): string {
  return (
    name
      .replace(/Bing Chun\s*-?\s*/gi, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .slice(0, 6)
      .toUpperCase() || 'BRANCH'
  );
}

async function ensureStoreCode(store: StoreRow): Promise<string> {
  if (store.code) return store.code;
  let code = slugStoreCode(store.name);
  let suffix = 1;
  while (await prisma.store.findFirst({ where: { code, id: { not: store.id } }, select: { id: true } })) {
    code = `${slugStoreCode(store.name)}${suffix}`;
    suffix += 1;
  }
  await prisma.store.update({ where: { id: store.id }, data: { code } });
  store.code = code;
  return code;
}

async function syncCachedStock(storeId: string): Promise<void> {
  const sums = await prisma.stockBatch.groupBy({
    by: ['productId'],
    where: { storeId, status: 'ACTIVE' },
    _sum: { remainingQty: true },
  });
  for (const row of sums) {
    const stock = row._sum.remainingQty ?? 0;
    await prisma.storeProduct.update({
      where: { storeId_productId: { storeId, productId: row.productId } },
      data: {
        stock,
        weeklyRemainingQty: stock,
        weeklyTargetQty: WEEKLY_TARGET_QTY,
        isAvailable: stock > 5,
      },
    });
  }
}

async function restockStore(store: StoreRow): Promise<void> {
  await syncStoreProducts(store.id, { stock: 0, isAvailable: false });
  const products = await prisma.storeProduct.findMany({
    where: { storeId: store.id },
    select: { productId: true },
  });
  if (products.length === 0) {
    throw new Error(`No catalog at ${store.name} — run npm run prisma:seed -w @bingchun/backend first`);
  }

  const existing = await prisma.stockBatch.findMany({
    where: { storeId: store.id, status: 'ACTIVE', remainingQty: { gt: 500 } },
    select: { productId: true },
  });
  const stocked = new Set(existing.map((r) => r.productId));
  const missing = products.filter((r) => !stocked.has(r.productId));
  if (missing.length === 0) {
    await syncCachedStock(store.id);
    return;
  }

  const code = await ensureStoreCode(store);
  const groupNumber = `R-${code}-${batchDateKey()}-001`;
  const receivedAt = new Date();
  const costs = await prisma.product.findMany({
    where: { id: { in: missing.map((r) => r.productId) } },
    select: { id: true, cost: true },
  });
  const costMap = new Map(costs.map((p) => [p.id, p.cost]));

  const group = await prisma.stockBatchGroup.create({
    data: {
      id: crypto.randomUUID(),
      storeId: store.id,
      batchNumber: groupNumber,
      resetDate: receivedAt,
      note: `${SEED_NOTE}restock`,
    },
  });

  await prisma.stockBatch.createMany({
    data: missing.map((row, i) => ({
      id: crypto.randomUUID(),
      batchNumber: `${groupNumber}-P${i + 1}`,
      batchType: 'RESET' as const,
      batchGroupId: group.id,
      storeId: store.id,
      productId: row.productId,
      receivedQty: RESET_QTY,
      remainingQty: RESET_QTY,
      receivedAt,
      unitCost: costMap.get(row.productId) ?? 0,
      status: 'ACTIVE' as const,
      note: `Reset batch ${groupNumber}`,
    })),
  });
  await syncCachedStock(store.id);
}

async function loadProduct(storeId: string): Promise<ProductPick> {
  const rows = await prisma.storeProduct.findMany({
    where: { storeId, isAvailable: true, stock: { gt: 0 } },
    include: { product: { select: { id: true, name: true, basePrice: true, isAvailable: true } } },
  });
  const available = rows.filter((r) => r.product.isAvailable);
  if (available.length === 0) throw new Error('No in-stock product at Nugegoda');
  available.sort((a, b) => b.product.basePrice - a.product.basePrice);
  const pick = available[0];
  return {
    productId: pick.product.id,
    name: pick.product.name,
    basePrice: pick.product.basePrice,
  };
}

async function placePaidPickupOrder(input: {
  store: StoreRow;
  actors: Actors;
  product: ProductPick;
  quantity: number;
  note: string;
}): Promise<{ id: string; orderNumber: string; total: number; storeId: string; loyaltyDiscount: number }> {
  const { store, actors, product, quantity, note } = input;
  const body: Record<string, unknown> = {
    orderMode: 'TAKEAWAY',
    storeId: store.id,
    items: [{ productId: product.productId, size: 'REGULAR', toppingIds: [], quantity }],
    paymentMethod: 'PAYHERE' satisfies PaymentMethod,
    channel: 'APP',
    notes: note,
    platform: 0,
    skipLoyaltyAutoApply: true,
    usePoints: LOYALTY_POINTS_TO_USE,
    ...takeawaySchedulingNow(),
  };

  const data = await runHandler<{
    order: { id: string; orderNumber: string; total: number; orderMode: OrderMode; storeId: string };
  }>(placeOrder, {
    body,
    user: actors.customer,
    headers: { 'idempotency-key': crypto.randomUUID() },
  });

  const order = data.order;
  const row = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: {
      total: true,
      userId: true,
      paymentMethod: true,
      orderMode: true,
      loyaltyDiscount: true,
      subtotal: true,
    },
  });

  if (row.loyaltyDiscount <= 0) {
    throw new Error('Expected loyalty discount on order — check loyalty settings and point balance');
  }

  await markOnlineOrderPaid(
    {
      id: order.id,
      orderNumber: order.orderNumber,
      storeId: order.storeId,
      total: row.total,
      paymentMethod: row.paymentMethod,
      userId: row.userId,
      orderMode: row.orderMode,
    },
    { paymentRef: `${SEED_NOTE}pay-${crypto.randomUUID()}` },
  );

  const paid = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { id: true, orderNumber: true, total: true, storeId: true, loyaltyDiscount: true },
  });
  return paid;
}

async function shiftTimelines(orderId: string, targetPlacedAt: Date): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      createdAt: true,
      updatedAt: true,
      cancelWindowStartsAt: true,
      scheduledPickupAt: true,
    },
  });
  if (!order) return;
  const delta = targetPlacedAt.getTime() - order.createdAt.getTime();
  if (delta === 0) return;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      createdAt: targetPlacedAt,
      updatedAt: new Date(order.updatedAt.getTime() + delta),
      cancelWindowStartsAt: order.cancelWindowStartsAt
        ? new Date(order.cancelWindowStartsAt.getTime() + delta)
        : undefined,
      scheduledPickupAt: order.scheduledPickupAt
        ? new Date(order.scheduledPickupAt.getTime() + delta)
        : undefined,
    },
  });

  for (const ev of await prisma.orderStatusEvent.findMany({
    where: { orderId },
    select: { id: true, createdAt: true },
  })) {
    await prisma.orderStatusEvent.update({
      where: { id: ev.id },
      data: { createdAt: new Date(ev.createdAt.getTime() + delta) },
    });
  }

  for (const tx of await prisma.walletTransaction.findMany({
    where: { orderId },
    select: { id: true, createdAt: true },
  })) {
    await prisma.walletTransaction.update({
      where: { id: tx.id },
      data: { createdAt: new Date(tx.createdAt.getTime() + delta) },
    });
  }

  for (const lt of await prisma.loyaltyTransaction.findMany({
    where: { orderId },
    select: { id: true, createdAt: true },
  })) {
    await prisma.loyaltyTransaction.update({
      where: { id: lt.id },
      data: { createdAt: new Date(lt.createdAt.getTime() + delta) },
    });
  }
}

async function deleteSeedOrder(orderId: string): Promise<void> {
  const allocs = await prisma.stockBatchAllocation.findMany({
    where: { orderId },
    select: { batchId: true, quantity: true, reversedQty: true },
  });
  for (const alloc of allocs) {
    const restore = alloc.quantity - alloc.reversedQty;
    if (restore <= 0) continue;
    await prisma.stockBatch.update({
      where: { id: alloc.batchId },
      data: { remainingQty: { increment: restore }, status: 'ACTIVE' },
    });
  }
  await prisma.loyaltyTransaction.deleteMany({ where: { orderId } });
  await prisma.walletTransaction.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
}

async function main() {
  assertDevSeedOnly();
  const { year, clean } = parseArgs();
  const note = `${SEED_NOTE}${year}-09-02`;
  const placedAt = placedInColombo(year, SEPT_MONTH, SEPT_DAY, 12, 15);

  const store = await resolveNugegoda();
  console.log(`Store: ${store.name}`);
  console.log(`Target date: ${year}-09-02 (Colombo)\n`);

  const existing = await prisma.order.findFirst({
    where: { storeId: store.id, notes: note },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      loyaltyDiscount: true,
      createdAt: true,
      total: true,
    },
  });

  if (existing && !clean) {
    console.log(
      `Already seeded: ${existing.orderNumber}  loyalty -${existing.loyaltyDiscount}  ` +
        `${existing.status}/${existing.paymentStatus}  created ${existing.createdAt.toISOString()}  LKR ${existing.total}`,
    );
    console.log('Use --clean to replace.');
    return;
  }
  if (existing && clean) {
    await deleteSeedOrder(existing.id);
    console.log(`Removed prior ${existing.orderNumber}\n`);
  }

  await ensureOnlineCheckoutEnabled();
  await restockStore(store);
  const actors = await ensureActors();
  await ensureLoyaltyRedeemReady(actors.customerId, placedAt);

  const product = await loadProduct(store.id);
  const quantity = 2;
  console.log(`Product: ${product.name} (x${quantity})`);
  console.log(`Loyalty redeem: ${LOYALTY_POINTS_TO_USE} points\n`);

  const order = await placePaidPickupOrder({
    store,
    actors,
    product,
    quantity,
    note,
  });
  await shiftTimelines(order.id, placedAt);
  await prisma.order.update({
    where: { id: order.id },
    data: { scheduledPickupAt: new Date(placedAt.getTime() + 25 * 60 * 1000) },
  });
  await recalculateWalletBalance(store.id);

  const snapshot = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: {
      orderNumber: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      orderMode: true,
      subtotal: true,
      loyaltyDiscount: true,
      total: true,
      createdAt: true,
      scheduledPickupAt: true,
    },
  });

  console.log('✅ Created paid online pickup order with loyalty discount');
  console.log(`   ${snapshot.orderNumber}  ${snapshot.orderMode}  ${snapshot.paymentMethod}`);
  console.log(`   ${snapshot.status} / ${snapshot.paymentStatus}`);
  console.log(`   subtotal LKR ${snapshot.subtotal}  loyalty -${snapshot.loyaltyDiscount}  total LKR ${snapshot.total}`);
  console.log(`   createdAt: ${snapshot.createdAt.toISOString()}`);
  if (snapshot.scheduledPickupAt) {
    console.log(`   scheduledPickupAt: ${snapshot.scheduledPickupAt.toISOString()}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
