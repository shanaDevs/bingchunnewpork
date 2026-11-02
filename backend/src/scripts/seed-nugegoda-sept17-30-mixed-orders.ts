/**
 * Fourteen orders at Nugegoda (17–30 Sep): rotating delivery online (PAYHERE),
 * pickup online (PAYHERE), and pickup card (CARD). All paid online; backdated per day.
 *
 *   npm run seed:nuge-sept17-30 -w @bingchun/backend
 *   npm run seed:nuge-sept17-30 -w @bingchun/backend -- --year=2026 --clean
 */
import crypto from 'crypto';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import type { OrderMode, OrderStatus, PaymentMethod } from '@prisma/client';
import {
  completeTakeawayPickup,
  placeOrder,
  updateOrderStatus,
} from '../controllers/orderController';
import { markOnlineOrderPaid } from '../lib/onlineOrderPayment';
import { updatePaymentSettings } from '../lib/paymentSettings';
import { prisma } from '../lib/prisma';
import { syncStoreProducts } from '../lib/storeInventory';
import { recalculateWalletBalance } from '../lib/walletSync';
import { normalizePhone } from '../utils/phone';
import { runHandler, type HarnessUser } from './lib/seedControllerHarness';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const SEED_NOTE = 'seed-nuge-sept17-30-';
const FIRST_DAY = 17;
const LAST_DAY = 30;
const SEPT_MONTH = 9;
const WALK_IN_PHONE = '0771001730';
const MIN_DELIVERY_SUBTOTAL = 500;
const WEEKLY_TARGET_QTY = 80;
const RESET_QTY = 2000;

type OrderKind = 'delivery-online' | 'pickup-online' | 'pickup-card';

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
  addressId: string;
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

function orderKindForDay(day: number): OrderKind {
  const kinds: OrderKind[] = ['delivery-online', 'pickup-online', 'pickup-card'];
  return kinds[(day - FIRST_DAY) % kinds.length];
}

function kindLabel(kind: OrderKind): string {
  if (kind === 'delivery-online') return 'DELIVERY/PAYHERE';
  if (kind === 'pickup-online') return 'TAKEAWAY/PAYHERE';
  return 'TAKEAWAY/CARD';
}

function takeawaySchedulingNow(): { scheduleMode: 15; scheduledAt: string } {
  const scheduledAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  return { scheduleMode: 15, scheduledAt };
}

/** Seeds may run outside 09:00–23:00 — widen the window for placement only. */
async function ensureStoreAcceptsOnlineOrders(storeId: string): Promise<void> {
  await prisma.store.update({
    where: { id: storeId },
    data: {
      branchClosedAt: null,
      openTime: '00:00',
      closeTime: '23:59',
      onlineOrderStartTime: '00:00',
      onlineOrderStopTime: '23:59',
      pickupCutoffMinutes: 0,
    },
  });
}

async function ensureOnlineCheckoutEnabled(): Promise<void> {
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
  if (!store.deliveryEnabled) {
    await prisma.store.update({ where: { id: store.id }, data: { deliveryEnabled: true } });
    store.deliveryEnabled = true;
  }
  return store;
}

async function ensureActors(store: StoreRow): Promise<Actors> {
  const seedPhone = normalizePhone(WALK_IN_PHONE);
  const email = 'seed.nuge.sept17-30@bingchun-test.lk';
  let user = await prisma.user.findFirst({ where: { OR: [{ phone: seedPhone }, { email }] } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Sept 17–30 Mixed Seed',
        phone: seedPhone,
        email,
        passwordHash: await bcrypt.hash('Customer@123', 10),
        isPhoneVerified: true,
      },
    });
  }

  const addressLine = `30 Mixed Orders Lane, ${store.city}`;
  let address = await prisma.address.findFirst({ where: { userId: user.id, addressLine } });
  if (!address) {
    address = await prisma.address.create({
      data: {
        userId: user.id,
        label: 'Home',
        addressLine,
        city: store.city,
        district: store.district,
        lat: store.lat + 0.002,
        lng: store.lng + 0.0015,
        isDefault: true,
      },
    });
  }

  let staff = await prisma.adminUser.findFirst({
    where: { storeId: store.id, isActive: true, role: { name: 'CASHIER' } },
    select: { id: true },
  });
  if (!staff) {
    staff = await prisma.adminUser.findFirst({
      where: { storeId: store.id, isActive: true, role: { name: 'STORE_MANAGER' } },
      select: { id: true },
    });
  }
  if (!staff) throw new Error('No branch staff at Nugegoda');

  return {
    customerId: user.id,
    addressId: address.id,
    customer: { sub: user.id, type: 'user' },
    branchStaff: { sub: staff.id, type: 'admin', role: 'CASHIER', storeId: store.id },
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

async function loadProducts(storeId: string): Promise<ProductPick[]> {
  const rows = await prisma.storeProduct.findMany({
    where: { storeId, isAvailable: true, stock: { gt: 0 } },
    include: { product: { select: { id: true, name: true, basePrice: true, isAvailable: true } } },
  });
  const list = rows
    .filter((r) => r.product.isAvailable)
    .map((r) => ({
      productId: r.product.id,
      name: r.product.name,
      basePrice: r.product.basePrice,
    }))
    .sort((a, b) => b.basePrice - a.basePrice);
  if (list.length === 0) throw new Error('No in-stock products');
  return list;
}

function quantityForOrder(kind: OrderKind, basePrice: number, day: number): number {
  let qty = 1 + (day % 3);
  if (kind === 'delivery-online') {
    while (qty * Math.max(basePrice, 1) < MIN_DELIVERY_SUBTOTAL && qty < 10) qty += 1;
  } else {
    qty = Math.max(2, qty);
  }
  return qty;
}

async function markPaid(order: {
  id: string;
  orderNumber: string;
  storeId: string;
  total: number;
  paymentMethod: PaymentMethod;
  userId: string | null;
  orderMode: OrderMode;
}): Promise<void> {
  await markOnlineOrderPaid(order, { paymentRef: `${SEED_NOTE}pay-${crypto.randomUUID()}` });
}

async function placeOrderForKind(input: {
  kind: OrderKind;
  store: StoreRow;
  actors: Actors;
  product: ProductPick;
  quantity: number;
  note: string;
}): Promise<string> {
  const { kind, store, actors, product, quantity, note } = input;

  const body: Record<string, unknown> = {
    storeId: store.id,
    items: [{ productId: product.productId, size: 'REGULAR', toppingIds: [], quantity }],
    channel: 'APP',
    notes: note,
    platform: 0,
    skipLoyaltyAutoApply: true,
  };

  if (kind === 'delivery-online') {
    const [addr, user] = await Promise.all([
      prisma.address.findUniqueOrThrow({
        where: { id: actors.addressId },
        select: { addressLine: true, city: true, district: true, lat: true, lng: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: actors.customerId },
        select: { name: true, phone: true },
      }),
    ]);
    body.orderMode = 'DELIVERY';
    body.paymentMethod = 'PAYHERE' satisfies PaymentMethod;
    body.addressId = actors.addressId;
    body.guestName = user.name;
    body.guestPhone = user.phone;
    body.deliveryAddress = {
      addressLine: addr.addressLine,
      city: addr.city,
      district: addr.district,
      lat: addr.lat ?? store.lat + 0.002,
      lng: addr.lng ?? store.lng + 0.0015,
    };
  } else {
    body.orderMode = 'TAKEAWAY';
    body.paymentMethod = (kind === 'pickup-card' ? 'CARD' : 'PAYHERE') satisfies PaymentMethod;
    Object.assign(body, takeawaySchedulingNow());
  }

  const data = await runHandler<{
    order: {
      id: string;
      orderNumber: string;
      total: number;
      orderMode: OrderMode;
      storeId: string;
    };
  }>(placeOrder, {
    body,
    user: actors.customer,
    headers: { 'idempotency-key': crypto.randomUUID() },
  });

  const row = await prisma.order.findUniqueOrThrow({
    where: { id: data.order.id },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      userId: true,
      paymentMethod: true,
      orderMode: true,
      storeId: true,
    },
  });

  await markPaid(row);
  return row.id;
}

async function setStatus(
  orderId: string,
  status: OrderStatus,
  staff: HarnessUser & { type: 'admin' },
  note?: string,
): Promise<void> {
  await runHandler(updateOrderStatus, {
    method: 'PUT',
    params: { id: orderId },
    user: staff,
    body: { status, note },
  });
}

async function advanceToDelivered(orderId: string, staff: HarnessUser & { type: 'admin' }): Promise<void> {
  const flow: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  const start = flow.indexOf(order.status as OrderStatus);
  const end = flow.indexOf('DELIVERED');
  if (start < 0 || end <= start) return;
  for (let i = start + 1; i <= end; i += 1) {
    await setStatus(orderId, flow[i], staff, `${SEED_NOTE}${flow[i]}`);
  }
}

async function completePrepaidPickup(orderId: string, staff: HarnessUser & { type: 'admin' }): Promise<void> {
  await runHandler(completeTakeawayPickup, {
    method: 'POST',
    params: { id: orderId },
    user: staff,
    body: {
      collectPayment: false,
      note: `${SEED_NOTE}picked up (prepaid)`,
    },
  });
}

async function shiftTimelines(orderId: string, targetPlacedAt: Date, kind: OrderKind): Promise<void> {
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

  const scheduledPickupAt =
    kind !== 'delivery-online'
      ? new Date(targetPlacedAt.getTime() + 25 * 60 * 1000)
      : order.scheduledPickupAt
        ? new Date(order.scheduledPickupAt.getTime() + delta)
        : undefined;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      createdAt: targetPlacedAt,
      updatedAt: new Date(order.updatedAt.getTime() + delta),
      cancelWindowStartsAt: order.cancelWindowStartsAt
        ? new Date(order.cancelWindowStartsAt.getTime() + delta)
        : undefined,
      scheduledPickupAt,
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
}

async function deleteSeedOrders(storeId: string): Promise<number> {
  const seedOrders = await prisma.order.findMany({
    where: { storeId, notes: { startsWith: SEED_NOTE } },
    select: { id: true },
  });
  if (seedOrders.length === 0) return 0;
  const ids = seedOrders.map((o) => o.id);

  const allocs = await prisma.stockBatchAllocation.findMany({
    where: { orderId: { in: ids } },
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

  await prisma.walletTransaction.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

async function main() {
  assertDevSeedOnly();
  const { year, clean } = parseArgs();
  const totalDays = LAST_DAY - FIRST_DAY + 1;

  const store = await resolveNugegoda();
  console.log(`Store: ${store.name}`);
  console.log(`Target: ${year}-09-${FIRST_DAY} … ${year}-09-${LAST_DAY} (${totalDays} orders)\n`);

  const existing = await prisma.order.count({
    where: { storeId: store.id, notes: { startsWith: SEED_NOTE } },
  });
  if (existing >= totalDays && !clean) {
    console.log(`Already ${existing} seed orders — use --clean to replace.`);
    return;
  }
  if (clean && existing > 0) {
    console.log(`Removed ${await deleteSeedOrders(store.id)} prior seed order(s).\n`);
  } else if (existing > 0) {
    await deleteSeedOrders(store.id);
  }

  await ensureOnlineCheckoutEnabled();
  await ensureStoreAcceptsOnlineOrders(store.id);
  await restockStore(store);
  const actors = await ensureActors(store);
  const products = await loadProducts(store.id);

  const summary: string[] = [];

  for (let day = FIRST_DAY; day <= LAST_DAY; day += 1) {
    const kind = orderKindForDay(day);
    const note = `${SEED_NOTE}${year}-09-${String(day).padStart(2, '0')}-${kind}`;
    const placedAt = placedInColombo(year, SEPT_MONTH, day, 9 + (day % 7), (day * 17) % 60);
    const product = products[(day - FIRST_DAY) % products.length];
    const quantity = quantityForOrder(kind, product.basePrice, day);

    const orderId = await placeOrderForKind({
      kind,
      store,
      actors,
      product,
      quantity,
      note,
    });

    if (kind === 'delivery-online') {
      await advanceToDelivered(orderId, actors.branchStaff);
    } else {
      await completePrepaidPickup(orderId, actors.branchStaff);
    }

    await shiftTimelines(orderId, placedAt, kind);

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        orderNumber: true,
        orderMode: true,
        paymentMethod: true,
        status: true,
        paymentStatus: true,
        total: true,
        createdAt: true,
      },
    });

    summary.push(
      `  ${row.orderNumber}  ${year}-09-${String(day).padStart(2, '0')}  ${kindLabel(kind)}  ` +
        `${row.status}/${row.paymentStatus}  LKR ${row.total}`,
    );
  }

  await recalculateWalletBalance(store.id);

  console.log(`✅ Seeded ${totalDays} orders (delivery online · pickup online · pickup card):\n`);
  for (const line of summary) console.log(line);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
