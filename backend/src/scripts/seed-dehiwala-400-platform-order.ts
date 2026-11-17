/**
 * One PAID PayHere pickup at Dehiwala on 6 June — ~LKR 500 subtotal, no promo/discount.
 * Counts toward Online Available Balance (unlike counter cash), so branch payout can be initiated
 * while Jun–Jul platform commission stays negative from the Jun 20 promo batch.
 *
 *   npm run seed:dehiwala-jun6-500 -w @bingchun/backend
 *   npm run seed:dehiwala-jun6-500 -w @bingchun/backend -- --year=2026 --clean
 */
import crypto from 'crypto';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import type { OrderMode, PaymentMethod } from '@prisma/client';
import { completeTakeawayPickup, placeOrder } from '../controllers/orderController';
import { markOnlineOrderPaid } from '../lib/onlineOrderPayment';
import { updatePaymentSettings } from '../lib/paymentSettings';
import { prisma } from '../lib/prisma';
import { syncStoreProducts } from '../lib/storeInventory';
import { recalculateWalletBalance, syncMissingWalletPayments } from '../lib/walletSync';
import { normalizePhone } from '../utils/phone';
import { runHandler, type HarnessUser } from './lib/seedControllerHarness';
import { ensureAppSchema } from '../lib/appSchema';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const SEED_NOTE = 'seed-dehiwala-jun6-500-';
const LEGACY_SEED_PREFIXES = ['seed-dehiwala-400-', SEED_NOTE] as const;
const TARGET_SUBTOTAL_LKR = 500;
const ORDER_MONTH = 6;
const ORDER_DAY = 6;
const WALK_IN_PHONE = '0771000650';
const DEHIWALA_BRANCH_EMAIL = 'dehiwalabranch@gmail.com';
const DEHIWALA_BRANCH_PASSWORD = 'Branch@123';
const MAX_CASH_PICKUP_SUBTOTAL = 999;
const WEEKLY_TARGET_QTY = 80;
const RESET_QTY = 2000;

type StoreRow = {
  id: string;
  name: string;
  city: string;
  district: string;
  code: string | null;
  isActive: boolean;
};

type CatalogProduct = { productId: string; name: string; basePrice: number };

type CartPick = {
  lines: Array<CatalogProduct & { quantity: number }>;
  targetSubtotal: number;
};

type Actors = {
  customer: HarnessUser & { type: 'user' };
  branchStaff: HarnessUser & { type: 'admin' };
};

const storeSelect = {
  id: true,
  name: true,
  city: true,
  district: true,
  code: true,
  isActive: true,
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

async function ensurePayHerePickupEnabled(): Promise<void> {
  await updatePaymentSettings({
    activeOnlineGateway: 'PAYHERE',
    payhereMode: 'sandbox',
    payhereMerchantId: '1225599',
    payhereMerchantSecret: 'sandboxsecretkey123',
    paymentMethods: {
      PAYHERE: { enabled: true, label: 'Online Payment', modes: ['DELIVERY', 'TAKEAWAY'] },
      CARD: { enabled: true, label: 'Card Payment', modes: ['DELIVERY', 'TAKEAWAY'] },
      CASH_AT_COUNTER: { enabled: true, label: 'Cash at Counter', modes: ['TAKEAWAY'] },
    },
  });
}

async function resolveDehiwala(): Promise<StoreRow> {
  const store = await prisma.store.findFirst({
    where: {
      isActive: true,
      OR: [{ name: { equals: 'Bing Chun - Dehiwala' } }, { name: { equals: 'Bing Chun - Dehiwala 1' } }],
    },
    select: storeSelect,
  });
  if (!store) throw new Error('Bing Chun - Dehiwala not found — run prisma:seed');
  return store;
}

async function ensureDehiwalaBranchAdmin(storeId: string): Promise<string> {
  const role = await prisma.role.findFirst({ where: { name: 'STORE_MANAGER' }, select: { id: true } });
  if (!role) throw new Error('STORE_MANAGER role missing');
  const passwordHash = await bcrypt.hash(DEHIWALA_BRANCH_PASSWORD, 12);
  const admin = await prisma.adminUser.upsert({
    where: { email: DEHIWALA_BRANCH_EMAIL },
    update: { storeId, roleId: role.id, passwordHash, isActive: true },
    create: {
      name: 'Dehiwala Branch Manager',
      email: DEHIWALA_BRANCH_EMAIL,
      passwordHash,
      roleId: role.id,
      storeId,
      isActive: true,
    },
    select: { id: true },
  });
  return admin.id;
}

async function ensureActors(store: StoreRow): Promise<Actors> {
  const seedPhone = normalizePhone(WALK_IN_PHONE);
  const email = 'seed.dehiwala.jun6.500@bingchun-test.lk';
  let user = await prisma.user.findFirst({ where: { OR: [{ phone: seedPhone }, { email }] } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Dehiwala LKR 500 Jun6 Seed',
        phone: seedPhone,
        email,
        passwordHash: await bcrypt.hash('Customer@123', 10),
        isPhoneVerified: true,
      },
    });
  }
  const managerId = await ensureDehiwalaBranchAdmin(store.id);
  const branchStaff = {
    sub: managerId,
    type: 'admin' as const,
    role: 'STORE_MANAGER',
    storeId: store.id,
  };
  return {
    customer: { sub: user.id, type: 'user' },
    branchStaff,
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
      data: { stock, weeklyRemainingQty: stock, weeklyTargetQty: WEEKLY_TARGET_QTY, isAvailable: stock > 5 },
    });
  }
}

async function restockStore(store: StoreRow): Promise<void> {
  await syncStoreProducts(store.id, { stock: 0, isAvailable: false });
  const products = await prisma.storeProduct.findMany({ where: { storeId: store.id }, select: { productId: true } });
  if (products.length === 0) throw new Error('No catalog — run prisma:seed first');

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
  const groupNumber = `R-${code}-${batchDateKey()}-${crypto.randomInt(100, 999)}`;
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

function findCartForTarget(products: CatalogProduct[], target: number): CartPick | null {
  let atOrAbove: CartPick | null = null;

  const consider = (lines: CartPick['lines'], subtotal: number) => {
    if (subtotal > MAX_CASH_PICKUP_SUBTOTAL) return;
    if (subtotal === target) {
      atOrAbove = { lines, targetSubtotal: subtotal };
      return true;
    }
    if (subtotal >= target && (!atOrAbove || subtotal < atOrAbove.targetSubtotal)) {
      atOrAbove = { lines, targetSubtotal: subtotal };
    }
    return false;
  };

  for (const p of products) {
    for (let qty = 1; qty <= 8; qty++) {
      const subtotal = p.basePrice * qty;
      if (subtotal > MAX_CASH_PICKUP_SUBTOTAL) break;
      if (consider([{ ...p, quantity: qty }], subtotal)) return atOrAbove;
    }
  }

  for (let i = 0; i < products.length; i++) {
    for (let j = i; j < products.length; j++) {
      const a = products[i];
      const b = products[j];
      if (i === j) continue;
      const subtotal = a.basePrice + b.basePrice;
      if (consider(
          [
            { ...a, quantity: 1 },
            { ...b, quantity: 1 },
          ],
          subtotal,
        )) {
        return atOrAbove;
      }
    }
  }

  return atOrAbove;
}

async function loadCartForTargetSubtotal(storeId: string): Promise<CartPick> {
  const rows = await prisma.storeProduct.findMany({
    where: { storeId, isAvailable: true, stock: { gt: 0 } },
    include: { product: { select: { id: true, name: true, basePrice: true, isAvailable: true } } },
  });
  const products: CatalogProduct[] = rows
    .filter((row) => row.product.isAvailable && row.product.basePrice > 0)
    .map((row) => ({
      productId: row.product.id,
      name: row.product.name,
      basePrice: row.product.basePrice,
    }));

  const cart = findCartForTarget(products, TARGET_SUBTOTAL_LKR);
  if (!cart) {
    throw new Error(`No pickup cart reaches LKR ${TARGET_SUBTOTAL_LKR}+ with current catalog`);
  }
  return cart;
}

async function placePayHerePickupOrder(input: {
  store: StoreRow;
  actors: Actors;
  cart: CartPick;
  note: string;
}): Promise<{ id: string; orderNumber: string; subtotal: number; total: number; discount: number }> {
  const { store, actors, cart, note } = input;
  const body: Record<string, unknown> = {
    orderMode: 'TAKEAWAY',
    storeId: store.id,
    items: cart.lines.map((line) => ({
      productId: line.productId,
      size: 'REGULAR',
      toppingIds: [],
      quantity: line.quantity,
    })),
    paymentMethod: 'PAYHERE' satisfies PaymentMethod,
    channel: 'APP',
    notes: note,
    platform: 0,
    skipLoyaltyAutoApply: true,
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
      id: true,
      orderNumber: true,
      subtotal: true,
      total: true,
      discount: true,
      userId: true,
      paymentMethod: true,
      orderMode: true,
    },
  });
  if (row.discount > 0) throw new Error(`Expected no discount, got LKR ${row.discount}`);
  if (Math.round(row.subtotal) < TARGET_SUBTOTAL_LKR) {
    throw new Error(`Expected subtotal at least LKR ${TARGET_SUBTOTAL_LKR}, got ${row.subtotal}`);
  }

  await markOnlineOrderPaid(
    {
      id: order.id,
      orderNumber: row.orderNumber,
      storeId: order.storeId,
      total: row.total,
      paymentMethod: row.paymentMethod,
      userId: row.userId,
      orderMode: row.orderMode,
    },
    { paymentRef: `${SEED_NOTE}pay-${crypto.randomUUID()}` },
  );

  return row;
}

async function completePayHerePickup(orderId: string, staff: HarnessUser & { type: 'admin' }): Promise<void> {
  await runHandler(completeTakeawayPickup, {
    method: 'POST',
    params: { id: orderId },
    user: staff,
    body: {
      collectPayment: false,
      note: `${SEED_NOTE}picked up (PayHere prepaid)`,
    },
  });
}

async function shiftTimelines(orderId: string, targetPlacedAt: Date): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { createdAt: true, updatedAt: true, scheduledPickupAt: true, processedAt: true },
  });
  if (!order) return;
  const delta = targetPlacedAt.getTime() - order.createdAt.getTime();
  if (delta === 0) return;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      createdAt: targetPlacedAt,
      updatedAt: new Date(order.updatedAt.getTime() + delta),
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
  process.env.RUNTIME_SCHEMA_PATCHES = 'true';
  await ensureAppSchema();

  const { year, clean } = parseArgs();
  const dateKey = `${year}-${String(ORDER_MONTH).padStart(2, '0')}-${String(ORDER_DAY).padStart(2, '0')}`;
  const note = `${SEED_NOTE}${dateKey}-payhere`;
  const placedAt = placedInColombo(year, ORDER_MONTH, ORDER_DAY, 11, 15);

  const store = await resolveDehiwala();
  console.log(`Store: ${store.name}`);
  console.log(`Target: ${dateKey} PayHere pickup subtotal LKR ${TARGET_SUBTOTAL_LKR}+, no promo\n`);

  const seedWhere = {
    storeId: store.id,
    OR: LEGACY_SEED_PREFIXES.map((prefix) => ({ notes: { startsWith: prefix } })),
  };

  const existing = await prisma.order.findFirst({
    where: seedWhere,
    select: { id: true, orderNumber: true, notes: true, subtotal: true, total: true, discount: true },
  });
  if (existing && !clean) {
    if (existing.notes === note) {
      console.log(
        `Already seeded: ${existing.orderNumber} subtotal ${existing.subtotal} discount ${existing.discount} total ${existing.total}`,
      );
      console.log('Use --clean to replace.');
      return;
    }
    console.log(`Prior seed: ${existing.orderNumber} (${existing.notes}). Use --clean to replace.`);
    return;
  }
  if (clean) {
    const prior = await prisma.order.findMany({
      where: seedWhere,
      select: { id: true, orderNumber: true },
    });
    for (const row of prior) {
      await deleteSeedOrder(row.id);
      console.log(`Removed prior ${row.orderNumber}`);
    }
    if (prior.length > 0) console.log('');
  }

  await prisma.store.update({
    where: { id: store.id },
    data: { onlineOrderStartTime: '00:00', onlineOrderStopTime: '23:59' },
  });

  await ensurePayHerePickupEnabled();
  await restockStore(store);
  const actors = await ensureActors(store);
  const cart = await loadCartForTargetSubtotal(store.id);
  const cartDesc = cart.lines
    .map((line) => `${line.name} x${line.quantity} @ ${line.basePrice}`)
    .join(' + ');
  console.log(`Cart: ${cartDesc}  (expected subtotal LKR ${cart.targetSubtotal})\n`);
  if (cart.targetSubtotal !== TARGET_SUBTOTAL_LKR) {
    console.log(
      `Note: catalog cannot sum to exactly LKR ${TARGET_SUBTOTAL_LKR}; using LKR ${cart.targetSubtotal} with no discount.\n`,
    );
  }

  const placed = await placePayHerePickupOrder({ store, actors, cart, note });
  await completePayHerePickup(placed.id, actors.branchStaff);
  await shiftTimelines(placed.id, placedAt);
  await prisma.order.update({
    where: { id: placed.id },
    data: { scheduledPickupAt: new Date(placedAt.getTime() + 25 * 60 * 1000) },
  });
  await syncMissingWalletPayments(store.id);
  await recalculateWalletBalance(store.id);

  const wallet = await prisma.storeWallet.findUnique({
    where: { storeId: store.id },
    select: { balance: true, totalEarnings: true, totalWithdrawn: true },
  });

  console.log(
    `✅ ${placed.orderNumber}  subtotal LKR ${placed.subtotal}  discount LKR ${placed.discount}  ` +
      `total LKR ${placed.total}  wallet balance LKR ${wallet?.balance ?? '—'}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());