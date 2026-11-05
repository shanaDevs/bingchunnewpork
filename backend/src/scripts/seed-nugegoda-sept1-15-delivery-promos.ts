/**
 * Fifteen PAID online DELIVERY orders at Nugegoda (1–15 Sep), each with a promo:
 * platform-funded, branch-funded, or SHARED split (branch + platform contribution).
 *
 *   npm run seed:nuge-sept1-15-delivery -w @bingchun/backend
 *   npm run seed:nuge-sept1-15-delivery -w @bingchun/backend -- --year=2026 --clean
 */
import crypto from 'crypto';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import type { OrderMode, OrderStatus, PaymentMethod } from '@prisma/client';
import { placeOrder, updateOrderStatus } from '../controllers/orderController';
import { markOnlineOrderPaid } from '../lib/onlineOrderPayment';
import { updatePaymentSettings } from '../lib/paymentSettings';
import { prisma } from '../lib/prisma';
import { syncStoreProducts } from '../lib/storeInventory';
import { recalculateWalletBalance } from '../lib/walletSync';
import { normalizePhone } from '../utils/phone';
import { runHandler, type HarnessUser } from './lib/seedControllerHarness';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const SEED_NOTE = 'seed-nuge-sept1-15-';
const FIRST_DAY = 1;
const LAST_DAY = 15;
const SEPT_MONTH = 9;
const WALK_IN_PHONE = '0771000115';
const WEEKLY_TARGET_QTY = 80;
const RESET_QTY = 2000;
const MIN_DELIVERY_SUBTOTAL = 550;

type PromoKind = 'PLATFORM' | 'BRANCH' | 'SHARED';

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

function promoKindForDay(day: number): PromoKind {
  const kinds: PromoKind[] = ['PLATFORM', 'BRANCH', 'SHARED'];
  return kinds[(day - FIRST_DAY) % kinds.length];
}

function promoCodeForKind(kind: PromoKind): string {
  if (kind === 'PLATFORM') return 'SEEDNUG-PLAT-10';
  if (kind === 'BRANCH') return 'SEEDNUG-BRN-10';
  return 'SEEDNUG-SHR-50-50';
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

async function ensurePromos(storeId: string): Promise<void> {
  await prisma.promoCode.upsert({
    where: { code: promoCodeForKind('PLATFORM') },
    update: {
      isActive: true,
      deletedAt: null,
      ownership: 'PLATFORM',
      platformSharePct: 100,
      branchSharePct: 0,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderValue: 500,
      promotionKind: 'PERCENTAGE_DISCOUNT',
      storeIds: null,
    },
    create: {
      code: promoCodeForKind('PLATFORM'),
      title: 'Seed — Platform contribution 10%',
      description: 'Platform-funded delivery promo (seed)',
      ownership: 'PLATFORM',
      platformSharePct: 100,
      branchSharePct: 0,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderValue: 500,
      promotionKind: 'PERCENTAGE_DISCOUNT',
      isActive: true,
      showOnHome: false,
    },
  });

  await prisma.promoCode.upsert({
    where: { code: promoCodeForKind('BRANCH') },
    update: {
      isActive: true,
      deletedAt: null,
      ownership: 'BRANCH',
      platformSharePct: 0,
      branchSharePct: 100,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderValue: 500,
      promotionKind: 'PERCENTAGE_DISCOUNT',
      storeIds: [storeId],
    },
    create: {
      code: promoCodeForKind('BRANCH'),
      title: 'Seed — Branch contribution 10%',
      description: 'Branch-funded delivery promo (seed)',
      ownership: 'BRANCH',
      platformSharePct: 0,
      branchSharePct: 100,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderValue: 500,
      promotionKind: 'PERCENTAGE_DISCOUNT',
      isActive: true,
      showOnHome: false,
      storeIds: [storeId],
    },
  });

  await prisma.promoCode.upsert({
    where: { code: promoCodeForKind('SHARED') },
    update: {
      isActive: true,
      deletedAt: null,
      ownership: 'SHARED',
      branchSharePct: 50,
      platformSharePct: 50,
      discountType: 'PERCENTAGE',
      discountValue: 12,
      minOrderValue: 500,
      promotionKind: 'PERCENTAGE_DISCOUNT',
      storeIds: [storeId],
      contributionSource: 'JASON',
    },
    create: {
      code: promoCodeForKind('SHARED'),
      title: 'Seed — Shared 50/50 contribution 12%',
      description: 'Branch + platform split promo (seed)',
      ownership: 'SHARED',
      branchSharePct: 50,
      platformSharePct: 50,
      discountType: 'PERCENTAGE',
      discountValue: 12,
      minOrderValue: 500,
      promotionKind: 'PERCENTAGE_DISCOUNT',
      isActive: true,
      showOnHome: false,
      storeIds: [storeId],
      contributionSource: 'JASON',
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
  const email = 'seed.nuge.sept1-15@bingchun-test.lk';
  let user = await prisma.user.findFirst({ where: { OR: [{ phone: seedPhone }, { email }] } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Sept 1–15 Delivery Seed',
        phone: seedPhone,
        email,
        passwordHash: await bcrypt.hash('Customer@123', 10),
        isPhoneVerified: true,
      },
    });
  }

  const addressLine = `18 Delivery Promo Lane, ${store.city}`;
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
  if (!cashier) throw new Error('No branch staff at Nugegoda — run seed:admin-users');

  return {
    customerId: user.id,
    addressId: address.id,
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

function quantityForSubtotal(basePrice: number, day: number): number {
  let qty = 2 + (day % 2);
  while (qty * Math.max(basePrice, 1) < MIN_DELIVERY_SUBTOTAL && qty < 10) qty += 1;
  return qty;
}

async function placePaidDelivery(input: {
  store: StoreRow;
  actors: Actors;
  product: ProductPick;
  quantity: number;
  note: string;
  promoCode: string;
}): Promise<string> {
  const { store, actors, product, quantity, note, promoCode } = input;
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

  const body: Record<string, unknown> = {
    orderMode: 'DELIVERY',
    storeId: store.id,
    items: [{ productId: product.productId, size: 'REGULAR', toppingIds: [], quantity }],
    paymentMethod: 'PAYHERE' satisfies PaymentMethod,
    channel: 'APP',
    notes: note,
    platform: 0,
    skipLoyaltyAutoApply: true,
    promoCode,
    addressId: actors.addressId,
    guestName: user.name,
    guestPhone: user.phone,
    deliveryAddress: {
      addressLine: addr.addressLine,
      city: addr.city,
      district: addr.district,
      lat: addr.lat ?? store.lat + 0.002,
      lng: addr.lng ?? store.lng + 0.0015,
    },
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
      discount: true,
    },
  });
  if (row.discount <= 0) {
    throw new Error(`Promo ${promoCode} did not apply on order ${order.orderNumber}`);
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

  return order.id;
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

async function advanceToDelivered(
  orderId: string,
  staff: HarnessUser & { type: 'admin' },
): Promise<void> {
  const flow: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  const start = flow.indexOf(order.status as OrderStatus);
  const end = flow.indexOf('DELIVERED');
  if (start < 0 || end <= start) return;
  for (let i = start + 1; i <= end; i += 1) {
    await setStatus(orderId, flow[i], staff, `${SEED_NOTE}advance-${flow[i]}`);
  }
}

async function shiftTimelines(orderId: string, targetPlacedAt: Date): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { createdAt: true, updatedAt: true, cancelWindowStartsAt: true },
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

async function deleteSeedOrders(storeId: string): Promise<number> {
  const seedOrders = await prisma.order.findMany({
    where: { storeId, notes: { startsWith: SEED_NOTE } },
    select: { id: true },
  });
  if (seedOrders.length === 0) return 0;
  const ids = seedOrders.map((o) => o.id);

  const allocs = await prisma.stockBatchAllocation.findMany({
    where: { orderId: { in: ids } },
    select: { orderId: true, batchId: true, quantity: true, reversedQty: true },
  });
  for (const alloc of allocs) {
    const restore = alloc.quantity - alloc.reversedQty;
    if (restore <= 0) continue;
    await prisma.stockBatch.update({
      where: { id: alloc.batchId },
      data: { remainingQty: { increment: restore }, status: 'ACTIVE' },
    });
  }

  await prisma.promotionUsage.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.walletTransaction.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

async function main() {
  assertDevSeedOnly();
  const { year, clean } = parseArgs();
  const store = await resolveNugegoda();

  console.log(`Store: ${store.name}`);
  console.log(`Target: ${year}-09-${String(FIRST_DAY).padStart(2, '0')} … ${year}-09-${LAST_DAY} (${LAST_DAY - FIRST_DAY + 1} delivery orders)\n`);

  const existing = await prisma.order.count({
    where: { storeId: store.id, notes: { startsWith: SEED_NOTE } },
  });
  if (existing >= LAST_DAY - FIRST_DAY + 1 && !clean) {
    console.log(`Already ${existing} seed orders — use --clean to replace.`);
    return;
  }
  if (clean && existing > 0) {
    const removed = await deleteSeedOrders(store.id);
    console.log(`Removed ${removed} prior seed order(s).\n`);
  } else if (existing > 0) {
    await deleteSeedOrders(store.id);
  }

  await ensureOnlineCheckoutEnabled();
  await ensurePromos(store.id);
  await restockStore(store);
  const actors = await ensureActors(store);
  const products = await loadProducts(store.id);

  const summary: string[] = [];

  for (let day = FIRST_DAY; day <= LAST_DAY; day += 1) {
    const kind = promoKindForDay(day);
    const promoCode = promoCodeForKind(kind);
    const note = `${SEED_NOTE}${year}-09-${String(day).padStart(2, '0')}-${kind.toLowerCase()}`;
    const placedAt = placedInColombo(year, SEPT_MONTH, day, 10 + (day % 6), (day * 13) % 60);
    const product = products[(day - FIRST_DAY) % products.length];
    const quantity = quantityForSubtotal(product.basePrice, day);

    const orderId = await placePaidDelivery({
      store,
      actors,
      product,
      quantity,
      note,
      promoCode,
    });
    await advanceToDelivered(orderId, actors.branchStaff);
    await shiftTimelines(orderId, placedAt);

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        orderNumber: true,
        status: true,
        paymentStatus: true,
        discount: true,
        total: true,
        createdAt: true,
        promoCode: true,
      },
    });
    const usage = await prisma.promotionUsage.findFirst({
      where: { orderId },
      select: {
        ownership: true,
        totalDiscountAmount: true,
        branchShareAmount: true,
        platformShareAmount: true,
      },
    });

    summary.push(
      `  ${row.orderNumber}  ${year}-09-${String(day).padStart(2, '0')}  ${kind}  ` +
        `${row.status}/${row.paymentStatus}  disc ${row.discount}  total ${row.total}  ` +
        `(branch LKR ${usage?.branchShareAmount ?? 0}, platform LKR ${usage?.platformShareAmount ?? 0})`,
    );
  }

  await recalculateWalletBalance(store.id);

  console.log('✅ Seeded 15 paid delivery orders with promo contributions:\n');
  for (const line of summary) console.log(line);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
