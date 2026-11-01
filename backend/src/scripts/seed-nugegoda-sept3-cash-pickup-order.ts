/**
 * One PICKUP (TAKEAWAY) cash order at Nugegoda with a platform promo discount,
 * collected at counter, backdated to 3 September (Colombo).
 *
 *   npm run seed:nuge-sept3-cash-pickup -w @bingchun/backend
 *   npm run seed:nuge-sept3-cash-pickup -w @bingchun/backend -- --year=2026 --clean
 */
import crypto from 'crypto';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import type { PaymentMethod } from '@prisma/client';
import { completeTakeawayPickup, placeOrder } from '../controllers/orderController';
import { updatePaymentSettings } from '../lib/paymentSettings';
import { prisma } from '../lib/prisma';
import { syncStoreProducts } from '../lib/storeInventory';
import { recalculateWalletBalance } from '../lib/walletSync';
import { normalizePhone } from '../utils/phone';
import { runHandler, type HarnessUser } from './lib/seedControllerHarness';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const SEED_NOTE = 'seed-nuge-sept3-cash-';
const SEPT_DAY = 3;
const SEPT_MONTH = 9;
const WALK_IN_PHONE = '0771000403';
const PLATFORM_PROMO = 'BINGCHUN50';
const WEEKLY_TARGET_QTY = 80;
const RESET_QTY = 2000;
/** Pickup subtotal must stay below online-only threshold (LKR 1000). */
const MAX_CASH_PICKUP_SUBTOTAL = 999;
const MIN_PROMO_SUBTOTAL = 800;

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
  branchStaff: HarnessUser & { type: 'admin' };
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

function takeawaySchedulingNow(): { scheduleMode: 15; scheduledAt: string } {
  return { scheduleMode: 15, scheduledAt: new Date(Date.now() + 25 * 60 * 1000).toISOString() };
}

async function ensureCashPickupEnabled(): Promise<void> {
  await updatePaymentSettings({
    paymentMethods: {
      PAYHERE: {
        enabled: true,
        label: 'Online Payment',
        modes: ['DELIVERY', 'TAKEAWAY'],
      },
      CARD: { enabled: false, label: 'Online Payment', modes: ['DELIVERY', 'TAKEAWAY'] },
      CASH_AT_COUNTER: {
        enabled: true,
        label: 'Cash at Counter',
        modes: ['TAKEAWAY'],
      },
    },
  });
}

async function ensurePlatformPromo(): Promise<void> {
  await prisma.promoCode.upsert({
    where: { code: PLATFORM_PROMO },
    update: {
      isActive: true,
      ownership: 'PLATFORM',
      platformSharePct: 100,
      branchSharePct: 0,
      minOrderValue: MIN_PROMO_SUBTOTAL,
      discountType: 'FIXED',
      discountValue: 50,
      deletedAt: null,
    },
    create: {
      code: PLATFORM_PROMO,
      description: 'LKR 50 off orders above LKR 800 (platform)',
      discountType: 'FIXED',
      discountValue: 50,
      minOrderValue: MIN_PROMO_SUBTOTAL,
      ownership: 'PLATFORM',
      platformSharePct: 100,
      branchSharePct: 0,
      isActive: true,
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
  if (!store) throw new Error('Bing Chun - Nugegoda not found');
  return store;
}

function branchSlugFromName(name: string): string {
  return (
    name
      .replace(/^Bing Chun\s*-\s*/i, '')
      .replace(/[^a-z0-9]+/gi, '')
      .toLowerCase()
      .slice(0, 24) || 'branch'
  );
}

async function ensureActors(store: StoreRow): Promise<Actors> {
  const seedPhone = normalizePhone(WALK_IN_PHONE);
  const email = 'seed.nuge.sept3@bingchun-test.lk';
  let user = await prisma.user.findFirst({ where: { OR: [{ phone: seedPhone }, { email }] } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Sept 3 Cash Pickup Seed',
        phone: seedPhone,
        email,
        passwordHash: await bcrypt.hash('Customer@123', 10),
        isPhoneVerified: true,
      },
    });
  }

  let cashier = await prisma.adminUser.findFirst({
    where: { storeId: store.id, isActive: true, role: { name: 'CASHIER' } },
    select: { id: true },
  });
  if (!cashier) {
    cashier = await prisma.adminUser.findFirst({
      where: { storeId: store.id, isActive: true, role: { name: 'STORE_MANAGER' } },
      select: { id: true },
    });
  }
  if (!cashier) {
    const role = await prisma.role.findFirst({ where: { name: 'STORE_MANAGER' }, select: { id: true } });
    if (!role) throw new Error('STORE_MANAGER role missing');
    const slug = branchSlugFromName(store.name);
    cashier = await prisma.adminUser.upsert({
      where: { email: 'branch@bingchunsrilanka.lk' },
      update: { storeId: store.id, roleId: role.id, isActive: true },
      create: {
        name: 'Nugegoda Branch Manager',
        email: 'branch@bingchunsrilanka.lk',
        passwordHash: await bcrypt.hash('Branch@123', 10),
        roleId: role.id,
        storeId: store.id,
      },
      select: { id: true },
    });
  }

  return {
    customer: { sub: user.id, type: 'user' },
    branchStaff: {
      sub: cashier.id,
      type: 'admin',
      role: 'CASHIER',
      storeId: store.id,
    },
  };
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
    throw new Error('No catalog — run prisma:seed first');
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

function quantityForCashPromo(basePrice: number): number {
  let qty = Math.max(1, Math.ceil(MIN_PROMO_SUBTOTAL / Math.max(basePrice, 1)));
  while (qty * basePrice > MAX_CASH_PICKUP_SUBTOTAL && qty > 1) qty -= 1;
  const subtotal = qty * basePrice;
  if (subtotal < MIN_PROMO_SUBTOTAL || subtotal > MAX_CASH_PICKUP_SUBTOTAL) {
    throw new Error(
      `No quantity fits cash pickup (${MIN_PROMO_SUBTOTAL}–${MAX_CASH_PICKUP_SUBTOTAL}) for unit ${basePrice}`,
    );
  }
  return qty;
}

async function loadProduct(storeId: string): Promise<ProductPick> {
  const rows = await prisma.storeProduct.findMany({
    where: { storeId, isAvailable: true, stock: { gt: 0 } },
    include: { product: { select: { id: true, name: true, basePrice: true, isAvailable: true } } },
  });
  const candidates = rows
    .filter((r) => r.product.isAvailable)
    .map((r) => ({
      productId: r.product.id,
      name: r.product.name,
      basePrice: r.product.basePrice,
    }))
    .filter((p) => {
      try {
        quantityForCashPromo(p.basePrice);
        return true;
      } catch {
        return false;
      }
    });
  if (candidates.length === 0) throw new Error('No product fits cash pickup + platform promo constraints');
  candidates.sort((a, b) => b.basePrice - a.basePrice);
  return candidates[0];
}

async function placeCashPickupOrder(input: {
  store: StoreRow;
  actors: Actors;
  product: ProductPick;
  quantity: number;
  note: string;
}): Promise<{ id: string; orderNumber: string; total: number; discount: number }> {
  const { store, actors, product, quantity, note } = input;
  const body: Record<string, unknown> = {
    orderMode: 'TAKEAWAY',
    storeId: store.id,
    items: [{ productId: product.productId, size: 'REGULAR', toppingIds: [], quantity }],
    paymentMethod: 'CASH_AT_COUNTER' satisfies PaymentMethod,
    channel: 'APP',
    notes: note,
    platform: 0,
    skipLoyaltyAutoApply: true,
    promoCode: PLATFORM_PROMO,
    ...takeawaySchedulingNow(),
  };

  const data = await runHandler<{ order: { id: string; orderNumber: string; total: number } }>(placeOrder, {
    body,
    user: actors.customer,
    headers: { 'idempotency-key': crypto.randomUUID() },
  });

  const row = await prisma.order.findUniqueOrThrow({
    where: { id: data.order.id },
    select: { id: true, orderNumber: true, total: true, discount: true, promoCode: true },
  });
  if (row.discount <= 0) {
    throw new Error(`Expected platform promo discount (${PLATFORM_PROMO})`);
  }
  return row;
}

async function collectCashAtCounter(
  orderId: string,
  total: number,
  staff: HarnessUser & { type: 'admin' },
): Promise<void> {
  await runHandler(completeTakeawayPickup, {
    method: 'POST',
    params: { id: orderId },
    user: staff,
    body: {
      collectPayment: true,
      paymentMethod: 'CASH_AT_COUNTER',
      cashReceivedAmount: total,
      note: `${SEED_NOTE}picked up cash`,
    },
  });
}

async function shiftTimelines(orderId: string, targetPlacedAt: Date): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      createdAt: true,
      updatedAt: true,
      cancelWindowStartsAt: true,
      scheduledPickupAt: true,
      processedAt: true,
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
      processedAt: order.processedAt ? new Date(order.processedAt.getTime() + delta) : undefined,
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

  for (const pu of await prisma.promotionUsage.findMany({
    where: { orderId },
    select: { id: true, createdAt: true },
  })) {
    await prisma.promotionUsage.update({
      where: { id: pu.id },
      data: { createdAt: new Date(pu.createdAt.getTime() + delta) },
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
  await prisma.promotionUsage.deleteMany({ where: { orderId } });
  await prisma.walletTransaction.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
}

async function main() {
  assertDevSeedOnly();
  const { year, clean } = parseArgs();
  const note = `${SEED_NOTE}${year}-09-03`;
  const placedAt = placedInColombo(year, SEPT_MONTH, SEPT_DAY, 10, 45);

  const store = await resolveNugegoda();
  console.log(`Store: ${store.name}`);
  console.log(`Target date: ${year}-09-03 (Colombo)`);
  console.log(`Platform promo: ${PLATFORM_PROMO}\n`);

  const existing = await prisma.order.findFirst({
    where: { storeId: store.id, notes: note },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      discount: true,
      total: true,
      createdAt: true,
    },
  });

  if (existing && !clean) {
    console.log(
      `Already seeded: ${existing.orderNumber}  ${existing.paymentMethod}  promo -${existing.discount}  ` +
        `${existing.status}/${existing.paymentStatus}  ${existing.createdAt.toISOString()}  LKR ${existing.total}`,
    );
    console.log('Use --clean to replace.');
    return;
  }
  if (existing && clean) {
    await deleteSeedOrder(existing.id);
    console.log(`Removed prior ${existing.orderNumber}\n`);
  }

  await ensureCashPickupEnabled();
  await ensurePlatformPromo();
  await restockStore(store);
  const actors = await ensureActors(store);
  const product = await loadProduct(store.id);
  const quantity = quantityForCashPromo(product.basePrice);
  console.log(`Product: ${product.name} (x${quantity})\n`);

  const placed = await placeCashPickupOrder({ store, actors, product, quantity, note });
  await collectCashAtCounter(placed.id, placed.total, actors.branchStaff);
  await shiftTimelines(placed.id, placedAt);
  await prisma.order.update({
    where: { id: placed.id },
    data: { scheduledPickupAt: new Date(placedAt.getTime() + 25 * 60 * 1000) },
  });
  await recalculateWalletBalance(store.id);

  const snapshot = await prisma.order.findUniqueOrThrow({
    where: { id: placed.id },
    select: {
      orderNumber: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      orderMode: true,
      subtotal: true,
      discount: true,
      promoCode: true,
      total: true,
      createdAt: true,
    },
  });

  const promoUsage = await prisma.promotionUsage.findFirst({
    where: { orderId: placed.id },
    select: { ownership: true, platformShareAmount: true, totalDiscountAmount: true },
  });

  console.log('✅ Created pickup cash order with platform discount');
  console.log(`   ${snapshot.orderNumber}  ${snapshot.orderMode}  ${snapshot.paymentMethod}`);
  console.log(`   ${snapshot.status} / ${snapshot.paymentStatus}  promo ${snapshot.promoCode}`);
  console.log(`   subtotal LKR ${snapshot.subtotal}  platform -${snapshot.discount}  total LKR ${snapshot.total}`);
  if (promoUsage) {
    console.log(
      `   promotion usage: ${promoUsage.ownership}  discount LKR ${promoUsage.totalDiscountAmount}  platform share LKR ${promoUsage.platformShareAmount}`,
    );
  }
  console.log(`   createdAt: ${snapshot.createdAt.toISOString()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
