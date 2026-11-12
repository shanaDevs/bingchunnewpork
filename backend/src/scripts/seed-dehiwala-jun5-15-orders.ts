/**
 * Fifteen paid orders at Bing Chun — Dehiwala, one per day starting 5 June (Colombo).
 * Rotates: pickup cash, pickup card, pickup PayHere, delivery PayHere + promos (platform / branch / shared).
 * Ensures branch login dehiwalabranch@gmail.com / Branch@123.
 *
 *   npm run seed:dehiwala-jun5-15 -w @bingchun/backend
 *   npm run seed:dehiwala-jun5-15 -w @bingchun/backend -- --year=2026 --clean
 */
import crypto from 'crypto';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import type { OrderMode, OrderStatus, PaymentMethod } from '@prisma/client';
import { completeTakeawayPickup, placeOrder, updateOrderStatus } from '../controllers/orderController';
import { markOnlineOrderPaid } from '../lib/onlineOrderPayment';
import { updatePaymentSettings } from '../lib/paymentSettings';
import { prisma } from '../lib/prisma';
import { syncStoreProducts } from '../lib/storeInventory';
import { recalculateWalletBalance } from '../lib/walletSync';
import { normalizePhone } from '../utils/phone';
import { runHandler, type HarnessUser } from './lib/seedControllerHarness';
import { patchPrismaTransactionTimeout } from './lib/nugeDeliverySeedRefundFlow';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const SEED_NOTE = 'seed-dehiwala-jun5-15-';
const ORDER_COUNT = 15;
const START_MONTH = 6;
const START_DAY = 5;
const DEHIWALA_BRANCH_EMAIL = 'dehiwalabranch@gmail.com';
const DEHIWALA_BRANCH_PASSWORD = 'Branch@123';
/** Cash pickup subtotal must stay below online-only threshold (LKR 1000). */
const MAX_CASH_PICKUP_SUBTOTAL = 999;
const MIN_PROMO_SUBTOTAL = 800;
const MIN_DELIVERY_SUBTOTAL = 550;
const PLATFORM_PROMO = 'BINGCHUN50';
const WALK_IN_PHONE = '0771000605';
const WEEKLY_TARGET_QTY = 80;
const RESET_QTY = 2000;

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

type Scenario = 'delivery-online' | 'pickup-cash' | 'pickup-card' | 'pickup-payhere';

type Actors = {
  customer: HarnessUser & { type: 'user' };
  customerId: string;
  addressId: string;
  branchStaff: HarnessUser & { type: 'admin' };
  storeManager: HarnessUser & { type: 'admin' };
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

function colomboDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value ?? '2026'),
    month: Number(parts.find((p) => p.type === 'month')?.value ?? '9'),
    day: Number(parts.find((p) => p.type === 'day')?.value ?? '6'),
  };
}

function orderDateForIndex(year: number, index: number): Date {
  const start = placedInColombo(year, START_MONTH, START_DAY, 12, 0);
  return new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
}

function scenarioForIndex(index: number): Scenario {
  const cycle: Scenario[] = ['pickup-cash', 'pickup-card', 'pickup-payhere', 'delivery-online'];
  return cycle[index % 4];
}

function promoKindForIndex(index: number): PromoKind {
  const kinds: PromoKind[] = ['PLATFORM', 'BRANCH', 'SHARED'];
  return kinds[index % kinds.length];
}

function promoCodeForKind(kind: PromoKind): string {
  if (kind === 'PLATFORM') return 'SEEDDEH-PLAT-10';
  if (kind === 'BRANCH') return 'SEEDDEH-BRN-10';
  return 'SEEDDEH-SHR-50-50';
}

function takeawaySchedulingNow(): { scheduleMode: 15; scheduledAt: string } {
  return { scheduleMode: 15, scheduledAt: new Date(Date.now() + 25 * 60 * 1000).toISOString() };
}

async function ensurePaymentSettingsMixed(): Promise<void> {
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
      CARD: { enabled: true, label: 'Card Payment', modes: ['DELIVERY', 'TAKEAWAY'] },
      CASH_AT_COUNTER: {
        enabled: true,
        label: 'Cash at Counter',
        modes: ['TAKEAWAY'],
      },
    },
  });
}

async function ensureRotatingPromos(storeId: string): Promise<void> {
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

async function ensurePlatformPromoFixed(): Promise<void> {
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

async function widenOnlineOrderHoursForSeed(storeId: string): Promise<void> {
  await prisma.store.update({
    where: { id: storeId },
    data: { onlineOrderStartTime: '00:00', onlineOrderStopTime: '23:59' },
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
  if (!store.deliveryEnabled) {
    await prisma.store.update({ where: { id: store.id }, data: { deliveryEnabled: true } });
    store.deliveryEnabled = true;
  }
  return store;
}

async function ensureDehiwalaBranchAdmin(storeId: string): Promise<string> {
  const role = await prisma.role.findFirst({ where: { name: 'STORE_MANAGER' }, select: { id: true } });
  if (!role) throw new Error('STORE_MANAGER role missing — run prisma:seed');
  const passwordHash = await bcrypt.hash(DEHIWALA_BRANCH_PASSWORD, 12);
  const admin = await prisma.adminUser.upsert({
    where: { email: DEHIWALA_BRANCH_EMAIL },
    update: {
      name: 'Dehiwala Branch Manager',
      storeId,
      roleId: role.id,
      passwordHash,
      isActive: true,
    },
    create: {
      name: 'Dehiwala Branch Manager',
      email: DEHIWALA_BRANCH_EMAIL,
      passwordHash,
      roleId: role.id,
      storeId,
    },
  });
  return admin.id;
}

async function ensureActors(store: StoreRow): Promise<Actors> {
  const seedPhone = normalizePhone(WALK_IN_PHONE);
  const email = 'seed.dehiwala.jun5.15@bingchun-test.lk';
  let user = await prisma.user.findFirst({ where: { OR: [{ phone: seedPhone }, { email }] } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Dehiwala Jun5 15-day Seed',
        phone: seedPhone,
        email,
        passwordHash: await bcrypt.hash('Customer@123', 10),
        isPhoneVerified: true,
      },
    });
  }

  const addressLine = `88 Mixed Seed Lane, ${store.city}`;
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

  const managerId = await ensureDehiwalaBranchAdmin(store.id);
  const staffUser = {
    sub: managerId,
    type: 'admin' as const,
    role: 'STORE_MANAGER',
    storeId: store.id,
  };

  return {
    customerId: user.id,
    addressId: address.id,
    customer: { sub: user.id, type: 'user' },
    branchStaff: staffUser,
    storeManager: staffUser,
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

function quantityForDeliverySubtotal(basePrice: number, day: number): number {
  let qty = 2 + (day % 2);
  while (qty * Math.max(basePrice, 1) < MIN_DELIVERY_SUBTOTAL && qty < 10) qty += 1;
  return qty;
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

function pickProductAndQtyForCash(products: ProductPick[], dayIndex: number): { product: ProductPick; quantity: number } {
  const n = products.length;
  for (let k = 0; k < n; k += 1) {
    const product = products[(dayIndex + k) % n];
    try {
      return { product, quantity: quantityForCashPromo(product.basePrice) };
    } catch {
      // try next product
    }
  }
  throw new Error('No product fits cash pickup + platform promo constraints');
}

function quantityForCardPromo(basePrice: number): number {
  return Math.max(1, Math.ceil(MIN_PROMO_SUBTOTAL / Math.max(basePrice, 1)));
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

async function placeCashPickup(input: {
  store: StoreRow;
  actors: Actors;
  product: ProductPick;
  quantity: number;
  note: string;
}): Promise<{ id: string; total: number }> {
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
    select: { id: true, total: true, discount: true },
  });
  if (row.discount <= 0) {
    throw new Error(`Expected platform promo discount (${PLATFORM_PROMO})`);
  }
  return { id: row.id, total: row.total };
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

async function placeCardPickup(input: {
  store: StoreRow;
  actors: Actors;
  product: ProductPick;
  quantity: number;
  note: string;
}): Promise<string> {
  const { store, actors, product, quantity, note } = input;
  const body: Record<string, unknown> = {
    orderMode: 'TAKEAWAY',
    storeId: store.id,
    items: [{ productId: product.productId, size: 'REGULAR', toppingIds: [], quantity }],
    paymentMethod: 'CARD' satisfies PaymentMethod,
    channel: 'APP',
    notes: note,
    platform: 0,
    skipLoyaltyAutoApply: true,
    promoCode: PLATFORM_PROMO,
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
      discount: true,
      orderNumber: true,
    },
  });

  if (row.discount <= 0) {
    throw new Error(`Expected platform promo discount (${PLATFORM_PROMO})`);
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

  return order.id;
}

async function completeCardPickup(
  orderId: string,
  staff: HarnessUser & { type: 'admin' },
): Promise<void> {
  await runHandler(completeTakeawayPickup, {
    method: 'POST',
    params: { id: orderId },
    user: staff,
    body: {
      collectPayment: false,
      note: `${SEED_NOTE}picked up (card prepaid)`,
    },
  });
}

async function placePayherePickup(input: {
  store: StoreRow;
  actors: Actors;
  product: ProductPick;
  quantity: number;
  note: string;
}): Promise<string> {
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
    promoCode: PLATFORM_PROMO,
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
      discount: true,
      orderNumber: true,
    },
  });

  if (row.discount <= 0) {
    throw new Error(`Expected platform promo discount (${PLATFORM_PROMO})`);
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

  return order.id;
}

async function completePayherePickup(
  orderId: string,
  staff: HarnessUser & { type: 'admin' },
): Promise<void> {
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

async function shiftTimelinesPickup(orderId: string, targetPlacedAt: Date): Promise<void> {
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

async function shiftTimelinesDelivery(orderId: string, targetPlacedAt: Date): Promise<void> {
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
  await prisma.refund.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

async function main() {
  assertDevSeedOnly();
  patchPrismaTransactionTimeout();
  const { year, clean } = parseArgs();
  const store = await resolveDehiwala();
  const endParts = colomboDateParts(orderDateForIndex(year, ORDER_COUNT - 1));

  console.log(`Store: ${store.name}`);
  console.log(`Branch admin: ${DEHIWALA_BRANCH_EMAIL} / ${DEHIWALA_BRANCH_PASSWORD}`);
  console.log(
    `Target: ${ORDER_COUNT} orders (${year}-${String(START_MONTH).padStart(2, '0')}-${String(START_DAY).padStart(2, '0')} … ` +
      `${endParts.year}-${String(endParts.month).padStart(2, '0')}-${String(endParts.day).padStart(2, '0')}) — ` +
      'rotating: pickup cash, pickup card, pickup PayHere, delivery PayHere\n',
  );

  const existing = await prisma.order.count({
    where: { storeId: store.id, notes: { startsWith: SEED_NOTE } },
  });
  if (existing >= ORDER_COUNT && !clean) {
    console.log(`Already ${existing} seed orders — use --clean to replace.`);
    return;
  }
  if (clean && existing > 0) {
    const removed = await deleteSeedOrders(store.id);
    console.log(`Removed ${removed} prior seed order(s).\n`);
  } else if (existing > 0) {
    await deleteSeedOrders(store.id);
  }

  await ensurePaymentSettingsMixed();
  await widenOnlineOrderHoursForSeed(store.id);
  await ensureRotatingPromos(store.id);
  await ensurePlatformPromoFixed();
  await restockStore(store);
  const actors = await ensureActors(store);
  const products = await loadProducts(store.id);

  const summary: string[] = [];

  for (let i = 0; i < ORDER_COUNT; i += 1) {
    const scenario = scenarioForIndex(i);
    const parts = colomboDateParts(orderDateForIndex(year, i));
    const dateKey = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    const placedAt = placedInColombo(parts.year, parts.month, parts.day, 10 + (i % 6), (i * 13) % 60);

    if (scenario === 'delivery-online') {
      const kind = promoKindForIndex(i);
      const promoCode = promoCodeForKind(kind);
      const note = `${SEED_NOTE}${dateKey}-${scenario}-${kind.toLowerCase()}`;
      const product = products[i % products.length];
      const quantity = quantityForDeliverySubtotal(product.basePrice, i + 1);

      const orderId = await placePaidDelivery({ store, actors, product, quantity, note, promoCode });
      await advanceToDelivered(orderId, actors.branchStaff);
      await shiftTimelinesDelivery(orderId, placedAt);

      const row = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          orderNumber: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          discount: true,
          total: true,
          orderMode: true,
        },
      });
      summary.push(
        `  ${row.orderNumber}  ${dateKey}  ${scenario}  ${row.orderMode}  ${row.paymentMethod}  ` +
          `${row.status}/${row.paymentStatus}  disc ${row.discount}  total ${row.total}`,
      );
      continue;
    }

    if (scenario === 'pickup-payhere') {
      const note = `${SEED_NOTE}${dateKey}-pickup-payhere`;
      const product = products[i % products.length];
      const quantity = quantityForCardPromo(product.basePrice);
      const orderId = await placePayherePickup({ store, actors, product, quantity, note });
      await completePayherePickup(orderId, actors.branchStaff);
      await shiftTimelinesPickup(orderId, placedAt);
      await prisma.order.update({
        where: { id: orderId },
        data: { scheduledPickupAt: new Date(placedAt.getTime() + 25 * 60 * 1000) },
      });

      const row = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          orderNumber: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          discount: true,
          total: true,
          orderMode: true,
        },
      });
      summary.push(
        `  ${row.orderNumber}  ${dateKey}  pickup-payhere  ${row.orderMode}  ${row.paymentMethod}  ` +
          `${row.status}/${row.paymentStatus}  disc ${row.discount}  total ${row.total}`,
      );
      continue;
    }

    if (scenario === 'pickup-cash') {
      const note = `${SEED_NOTE}${dateKey}-pickup-cash`;
      const { product, quantity } = pickProductAndQtyForCash(products, i);
      const placed = await placeCashPickup({ store, actors, product, quantity, note });
      await collectCashAtCounter(placed.id, placed.total, actors.branchStaff);
      await shiftTimelinesPickup(placed.id, placedAt);
      await prisma.order.update({
        where: { id: placed.id },
        data: { scheduledPickupAt: new Date(placedAt.getTime() + 25 * 60 * 1000) },
      });

      const row = await prisma.order.findUniqueOrThrow({
        where: { id: placed.id },
        select: {
          orderNumber: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          discount: true,
          total: true,
          orderMode: true,
        },
      });
      summary.push(
        `  ${row.orderNumber}  ${dateKey}  pickup-cash  ${row.orderMode}  ${row.paymentMethod}  ` +
          `${row.status}/${row.paymentStatus}  disc ${row.discount}  total ${row.total}`,
      );
      continue;
    }

    // pickup-card
    const note = `${SEED_NOTE}${dateKey}-pickup-card`;
    const product = products[i % products.length];
    const quantity = quantityForCardPromo(product.basePrice);
    const orderId = await placeCardPickup({ store, actors, product, quantity, note });
    await completeCardPickup(orderId, actors.branchStaff);
    await shiftTimelinesPickup(orderId, placedAt);
    await prisma.order.update({
      where: { id: orderId },
      data: { scheduledPickupAt: new Date(placedAt.getTime() + 25 * 60 * 1000) },
    });

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        discount: true,
        total: true,
        orderMode: true,
      },
    });
    summary.push(
      `  ${row.orderNumber}  ${dateKey}  pickup-card  ${row.orderMode}  ${row.paymentMethod}  ` +
        `${row.status}/${row.paymentStatus}  disc ${row.discount}  total ${row.total}`,
    );
  }

  await recalculateWalletBalance(store.id);

  console.log(`✅ Seeded ${ORDER_COUNT} mixed orders:\n`);
  for (const line of summary) console.log(line);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
