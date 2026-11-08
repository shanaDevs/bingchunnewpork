/**
 * Dev-only reseed for canonical Bing Chun branches.
 *
 *   npm run seed:main-branches -w @bingchun/backend
 *   npm run seed:main-branches -w @bingchun/backend -- --clear
 *   npm run seed:main-branches -w @bingchun/backend -- --stock
 *   npm run seed:main-branches -w @bingchun/backend -- --orders
 *   npm run seed:main-branches -w @bingchun/backend -- --stock --from "Bing Chun - Nugegoda"
 *
 * Stock is received as RESET batches (same path as admin Bulk Restock).
 * Orders are customer-style: PAYHERE / CARD / CASH_AT_COUNTER — never COD.
 */
import crypto from 'crypto';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import type { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { BINGCHUN_STORES } from '../../prisma/data/stores';
import { centsToDecimal } from '../lib/moneyDecimal';
import { appliesConvenienceFee } from '../lib/orderPayment';
import { prisma } from '../lib/prisma';
import { syncStoreProducts } from '../lib/storeInventory';
import { normalizePhone } from '../utils/phone';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env') });
assertDevSeedOnly();

const SEED_NOTE = 'seed-main-';
const TREND_DAYS = 60;
const MIN_TREND_ORDERS = 60;
const WEEKLY_TARGET_QTY = 200;
const RESET_QTY = 50;
const DELIVERY_FEE_RATE = 0.065;
const PICKUP_FEE_RATE = 0.06;
const DEMO_CUSTOMER = {
  name: 'Demo Customer',
  phone: '0771234567',
  email: 'customer@bingchun.lk',
  password: 'Customer@123',
} as const;

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

function parseArgs(argv: string[]) {
  const flags = new Set(argv.filter((a) => a.startsWith('--') && !a.startsWith('--from')));
  const fromIdx = argv.findIndex((a) => a === '--from');
  const from = fromIdx >= 0 ? argv[fromIdx + 1] : undefined;
  const runClear = flags.has('--clear');
  const runStock = flags.has('--stock');
  const runOrders = flags.has('--orders');
  const runAll = !runClear && !runStock && !runOrders;
  return {
    clear: runAll || runClear,
    stock: runAll || runStock,
    orders: runAll || runOrders,
    from,
  };
}

function canonicalStoreNames(): Set<string> {
  const names = new Set<string>();
  for (const store of BINGCHUN_STORES) {
    names.add(store.name);
    for (const legacy of store.legacyNames ?? []) names.add(legacy);
  }
  return names;
}

function storeSlug(name: string): string {
  return name
    .replace(/Bing Chun\s*-?\s*/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'branch';
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function colomboParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: num('year'),
    month: num('month'),
    day: num('day'),
    hour: num('hour'),
    minute: num('minute'),
  };
}

/** Wall-clock in Asia/Colombo, stored as the matching UTC instant. */
function placedInColombo(daysAgo: number, hour: number, minute = 0): Date {
  const today = colomboParts();
  const day = new Date(Date.UTC(today.year, today.month - 1, today.day));
  day.setUTCDate(day.getUTCDate() - daysAgo);
  const y = day.getUTCFullYear();
  const m = String(day.getUTCMonth() + 1).padStart(2, '0');
  const d = String(day.getUTCDate()).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:00+05:30`);
}

function orderNumberFor(placedAt: Date): string {
  const p = colomboParts(placedAt);
  const yy = String(p.year).slice(-2);
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return `BC${yy}${mm}${dd}-${crypto.randomInt(1000, 10000)}`;
}

function convenientFee(orderMode: 'DELIVERY' | 'TAKEAWAY', paymentMethod: PaymentMethod, subtotal: number): number {
  if (!appliesConvenienceFee(orderMode, paymentMethod)) return 0;
  const rate = orderMode === 'DELIVERY' ? DELIVERY_FEE_RATE : PICKUP_FEE_RATE;
  return Math.round(subtotal * rate);
}

function statusEvents(
  orderMode: 'DELIVERY' | 'TAKEAWAY',
  status: OrderStatus,
  placedAt: Date,
): Array<{ status: OrderStatus; note: string; createdAt: Date }> {
  const flow: OrderStatus[] =
    orderMode === 'DELIVERY'
      ? ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED']
      : ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED'];
  if (status === 'CANCELLED') {
    return [
      { status: 'RECEIVED', note: 'Placed', createdAt: placedAt },
      { status: 'CANCELLED', note: 'Customer cancelled', createdAt: new Date(placedAt.getTime() + 8 * 60_000) },
    ];
  }
  const stop = flow.indexOf(status);
  const end = stop >= 0 ? stop : 0;
  return flow.slice(0, end + 1).map((step, idx) => ({
    status: step,
    note: step === 'RECEIVED' ? 'Placed' : step,
    createdAt: new Date(placedAt.getTime() + idx * 12 * 60_000),
  }));
}

async function wipe(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    console.log(`  cleared ${label}`);
  } catch (err) {
    console.warn(`  skip ${label}: ${(err as Error).message}`);
  }
}

async function clearOperationalData(): Promise<void> {
  console.log('\nClearing operational data (catalog and staff kept)...');

  await wipe('platform earnings', () => prisma.platformEarning.deleteMany());
  await wipe('platform monthly settlements', () => prisma.platformMonthlySettlement.deleteMany());
  await wipe('commission settlements', () => prisma.commissionSettlement.deleteMany());
  await wipe('jason ledger', () => prisma.jasonLedgerEntry.deleteMany());
  await wipe('store withdrawals', () => prisma.storeWithdrawal.deleteMany());
  await wipe('wallet transactions', () => prisma.walletTransaction.deleteMany());
  await wipe('store wallets', () => prisma.storeWallet.deleteMany());

  await wipe('delivery payouts', () => prisma.deliveryPayout.deleteMany());
  await wipe('delivery job rejections', () => prisma.deliveryJobRejection.deleteMany());
  await wipe('delivery job orders', () => prisma.deliveryJobOrder.deleteMany());
  await wipe('delivery attempts', () => prisma.deliveryAttempt.deleteMany());
  await wipe('delivery events', () => prisma.deliveryEvent.deleteMany());
  await wipe('delivery otps', () => prisma.deliveryOtp.deleteMany());
  await wipe('driver complaints', () => prisma.driverComplaint.deleteMany());
  await wipe('merit history', () => prisma.meritPointHistory.deleteMany());
  await wipe('rider ratings', () => prisma.riderRating.deleteMany());
  await wipe('delivery jobs', () => prisma.deliveryJob.deleteMany());
  await wipe('driver locations', () => prisma.driverLocation.deleteMany());
  await wipe('driver shifts', () => prisma.driverShift.deleteMany());
  await wipe('driver devices', () => prisma.driverDevice.deleteMany());
  await wipe('driver branch requests', () => prisma.driverBranchRequest.deleteMany());
  await wipe('delivery access logs', () => prisma.deliveryAccessLog.deleteMany());
  await wipe('delivery outbox', () => prisma.deliveryOutbox.deleteMany());
  await wipe('rider profiles', () => prisma.riderProfile.deleteMany());

  await wipe('refunds', () => prisma.refund.deleteMany());
  await wipe('promotion usages', () => prisma.promotionUsage.deleteMany());
  await wipe('stock batch allocations', () => prisma.stockBatchAllocation.deleteMany());
  await wipe('stock audit logs', () => prisma.stockAuditLog.deleteMany());
  await wipe('reservations', () => prisma.storeProductReservation.deleteMany());
  await wipe('platform ratings', () => prisma.platformRating.deleteMany());
  await wipe('channel messages', () => prisma.channelMessage.deleteMany());
  await wipe('orders', () => prisma.order.deleteMany());

  await wipe('conversation sessions', () => prisma.conversationSession.deleteMany());
  await wipe('customer channels', () => prisma.customerChannel.deleteMany());
  await wipe('spin results', () => prisma.spinResult.deleteMany());
  await wipe('customer audit logs', () => prisma.customerAuditLog.deleteMany());
  await wipe('customer notifications', () => prisma.customerNotification.deleteMany());
  await wipe('admin notifications', () => prisma.adminNotification.deleteMany());
  await wipe('notifications', () => prisma.notification.deleteMany());
  await wipe('loyalty transactions', () => prisma.loyaltyTransaction.deleteMany());
  await wipe('otp records', () => prisma.otpRecord.deleteMany());
  await wipe('wishlist items', () => prisma.wishlistItem.deleteMany());
  await wipe('product ratings', () => prisma.productRating.deleteMany());
  await wipe('carts', () => prisma.cart.deleteMany());
  await wipe('users', () => prisma.user.deleteMany());

  await wipe('stock batches', () => prisma.stockBatch.deleteMany());
  await wipe('stock batch groups', () => prisma.stockBatchGroup.deleteMany());
  await wipe('stock batch counters', () => prisma.stockBatchCounter.deleteMany());

  const zeroed = await prisma.storeProduct.updateMany({
    data: {
      stock: 0,
      weeklyBaseQty: 0,
      weeklyRemainingQty: 0,
      weeklyTargetQty: 0,
      isAvailable: false,
    },
  });
  console.log(`  zeroed ${zeroed.count} store_products rows`);

  await prisma.promoCode.updateMany({ data: { usedCount: 0 } });
  await prisma.adminUser.updateMany({
    where: { dutyStatus: { not: 'OFF_DUTY' } },
    data: { dutyStatus: 'OFF_DUTY' },
  });

  await deactivateDemoStores();

  const stores = await prisma.store.findMany({ select: { id: true } });
  if (stores.length > 0) {
    await prisma.storeWallet.createMany({
      data: stores.map((store) => ({
        id: crypto.randomUUID(),
        storeId: store.id,
        balance: centsToDecimal(0),
        totalEarnings: centsToDecimal(0),
        totalWithdrawn: centsToDecimal(0),
        currency: 'LKR',
      })),
      skipDuplicates: true,
    });
  }
  console.log(`  recreated ${stores.length} empty store wallets`);

  const leftover = await Promise.all([
    prisma.order.count(),
    prisma.user.count(),
    prisma.stockBatch.count(),
    prisma.storeProduct.count({ where: { OR: [{ stock: { gt: 0 } }, { weeklyBaseQty: { gt: 0 } }] } }),
  ]);
  if (leftover[0] > 0 || leftover[1] > 0 || leftover[2] > 0 || leftover[3] > 0) {
    throw new Error(
      `Clear incomplete: orders=${leftover[0]} users=${leftover[1]} batches=${leftover[2]} stockedRows=${leftover[3]}`,
    );
  }
}

async function deactivateDemoStores(): Promise<void> {
  const canonical = canonicalStoreNames();
  const extras = await prisma.store.findMany({
    where: { name: { notIn: [...canonical] } },
    select: { id: true, name: true },
  });
  if (extras.length === 0) {
    console.log('  no demo stores to remove');
    return;
  }

  const extraIds = extras.map((s) => s.id);
  const staff = await prisma.adminUser.findMany({
    where: { storeId: { in: extraIds } },
    select: { id: true, email: true },
  });
  for (const admin of staff) {
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { isActive: false, storeId: null, accessibleStores: { set: [] } },
    });
    console.log(`  deactivated staff ${admin.email}`);
  }

  await prisma.store.updateMany({
    where: { id: { in: extraIds } },
    data: { isActive: false, deliveryEnabled: false },
  });

  for (const store of extras) {
    try {
      await prisma.storeProduct.deleteMany({ where: { storeId: store.id } });
      await prisma.deliveryZone.deleteMany({ where: { storeId: store.id } });
      await prisma.storeWallet.deleteMany({ where: { storeId: store.id } });
      await prisma.stockBatchCounter.deleteMany({ where: { storeId: store.id } });
      await prisma.store.delete({ where: { id: store.id } });
      console.log(`  removed demo store ${store.name}`);
    } catch (err) {
      console.warn(`  deactivated demo store ${store.name} (could not delete: ${(err as Error).message})`);
    }
  }
}

async function listMainStores(from?: string): Promise<StoreRow[]> {
  const canonical = canonicalStoreNames();
  const stores = await prisma.store.findMany({
    where: { name: { in: [...canonical] } },
    select: {
      id: true,
      name: true,
      city: true,
      district: true,
      lat: true,
      lng: true,
      code: true,
      isActive: true,
      deliveryEnabled: true,
    },
    orderBy: { name: 'asc' },
  });

  let selected = stores;
  if (from) {
    const needle = from.toLowerCase();
    const start = selected.findIndex((s) => s.name.toLowerCase().includes(needle));
    if (start < 0) {
      throw new Error(`--from "${from}" did not match a canonical store`);
    }
    selected = selected.slice(start);
  }
  return selected;
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
  return name
    .replace(/Bing Chun\s*-?\s*/gi, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 6)
    .toUpperCase() || 'BRANCH';
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
  if (!store.isActive || !store.deliveryEnabled) {
    await prisma.store.update({
      where: { id: store.id },
      data: { isActive: true, deliveryEnabled: true },
    });
  }

  await syncStoreProducts(store.id, { stock: 0, isAvailable: false });
  await prisma.storeProduct.updateMany({
    where: { storeId: store.id, weeklyTargetQty: { lt: WEEKLY_TARGET_QTY } },
    data: { weeklyTargetQty: WEEKLY_TARGET_QTY },
  });

  const products = await prisma.storeProduct.findMany({
    where: { storeId: store.id },
    select: { productId: true },
  });
  if (products.length === 0) {
    throw new Error(`No store_products rows for ${store.name}`);
  }

  const existing = await prisma.stockBatch.findMany({
    where: { storeId: store.id },
    select: { productId: true },
  });
  const stocked = new Set(existing.map((row) => row.productId));
  const missing = products.filter((row) => !stocked.has(row.productId));

  if (missing.length === 0) {
    await syncCachedStock(store.id);
    console.log(`  skip ${store.name} (already has batches)`);
    return;
  }

  const code = await ensureStoreCode(store);
  const dateKey = batchDateKey();
  let seq = 1;
  let groupNumber = `R-${code}-${dateKey}-${String(seq).padStart(3, '0')}`;
  while (await prisma.stockBatchGroup.findFirst({ where: { storeId: store.id, batchNumber: groupNumber } })) {
    seq += 1;
    groupNumber = `R-${code}-${dateKey}-${String(seq).padStart(3, '0')}`;
  }

  const costs = await prisma.product.findMany({
    where: { id: { in: missing.map((row) => row.productId) } },
    select: { id: true, cost: true },
  });
  const costMap = new Map(costs.map((p) => [p.id, p.cost]));
  const receivedAt = new Date();
  const group = await prisma.stockBatchGroup.create({
    data: {
      id: crypto.randomUUID(),
      storeId: store.id,
      batchNumber: groupNumber,
      resetDate: receivedAt,
      note: 'Main-branch RESET restock',
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
  console.log(`  ${store.name}: RESET ${groupNumber} (${missing.length} products)`);
}

async function ensureDemoCustomer(passwordHash: string) {
  return prisma.user.upsert({
    where: { phone: DEMO_CUSTOMER.phone },
    update: {
      passwordHash,
      email: DEMO_CUSTOMER.email,
      name: DEMO_CUSTOMER.name,
      isPhoneVerified: true,
    },
    create: {
      name: DEMO_CUSTOMER.name,
      phone: DEMO_CUSTOMER.phone,
      email: DEMO_CUSTOMER.email,
      passwordHash,
      isPhoneVerified: true,
    },
  });
}

async function ensureBranchCustomer(
  store: StoreRow,
  index: number,
  passwordHash: string,
) {
  const phone = normalizePhone(`0773${String(index + 1).padStart(6, '0')}`);
  const email = `seed.main.${storeSlug(store.name)}@bingchun-test.lk`;
  let user = await prisma.user.findFirst({
    where: { OR: [{ phone }, { email }] },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: `${store.city} Customer`,
        phone,
        email,
        passwordHash,
        isPhoneVerified: true,
      },
    });
  }

  const lat = store.lat + 0.002;
  const lng = store.lng + 0.0015;
  const addressLine = `12 Seed Lane, ${store.city}`;
  let address = await prisma.address.findFirst({
    where: { userId: user.id, addressLine },
  });
  if (!address) {
    address = await prisma.address.create({
      data: {
        userId: user.id,
        label: 'Home',
        addressLine,
        city: store.city,
        district: store.district,
        lat,
        lng,
        isDefault: true,
      },
    });
  }
  return { user, address, lat, lng };
}

async function deductSeedFifo(
  storeId: string,
  items: Array<{ productId: string; quantity: number; orderItemId?: string }>,
  orderId: string,
): Promise<void> {
  const already = await prisma.stockBatchAllocation.count({ where: { orderId } });
  if (already > 0) return;

  for (const item of items) {
    let remaining = item.quantity;
    const batches = await prisma.stockBatch.findMany({
      where: { storeId, productId: item.productId, status: 'ACTIVE', remainingQty: { gt: 0 } },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, remainingQty: true },
    });
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.remainingQty, remaining);
      const newRemaining = batch.remainingQty - take;
      await prisma.stockBatch.update({
        where: { id: batch.id },
        data: {
          remainingQty: newRemaining,
          status: newRemaining <= 0 ? 'DEPLETED' : 'ACTIVE',
        },
      });
      await prisma.stockBatchAllocation.create({
        data: {
          id: crypto.randomUUID(),
          batchId: batch.id,
          orderId,
          orderItemId: item.orderItemId ?? null,
          storeId,
          productId: item.productId,
          quantity: take,
        },
      });
      remaining -= take;
    }
    if (remaining > 0) {
      throw new Error(`Insufficient stock for ${item.productId} (short ${remaining})`);
    }
    const sum = await prisma.stockBatch.aggregate({
      where: { storeId, productId: item.productId, status: 'ACTIVE' },
      _sum: { remainingQty: true },
    });
    const stock = sum._sum.remainingQty ?? 0;
    await prisma.storeProduct.update({
      where: { storeId_productId: { storeId, productId: item.productId } },
      data: { stock, weeklyRemainingQty: stock, isAvailable: stock > 5 },
    });
  }
}

async function uniqueOrderNumber(placedAt: Date): Promise<string> {
  for (let i = 0; i < 8; i += 1) {
    const orderNumber = orderNumberFor(placedAt);
    const exists = await prisma.order.findUnique({ where: { orderNumber }, select: { id: true } });
    if (!exists) return orderNumber;
  }
  return `BC${Date.now()}-${crypto.randomInt(1000, 9999)}`;
}

type TrendSpec = {
  key: string;
  status: OrderStatus;
  orderMode: 'DELIVERY' | 'TAKEAWAY';
  paymentMethod: PaymentMethod;
  placedAt: Date;
  product: { id: string; name: string; basePrice: number };
  qty: number;
  deduct: boolean;
  job: boolean;
};

function buildTrendSpecs(
  storeIndex: number,
  products: Array<{ id: string; name: string; basePrice: number }>,
  cheap: { id: string; name: string; basePrice: number },
): TrendSpec[] {
  const specs: TrendSpec[] = [
    {
      key: 'live-ready-1',
      status: 'READY',
      orderMode: 'DELIVERY',
      paymentMethod: 'PAYHERE',
      placedAt: hoursAgo(2),
      product: products[storeIndex % products.length],
      qty: 1,
      deduct: true,
      job: false,
    },
    {
      key: 'live-ready-2',
      status: 'READY',
      orderMode: 'DELIVERY',
      paymentMethod: 'CARD',
      placedAt: hoursAgo(1),
      product: products[(storeIndex + 1) % products.length],
      qty: 1,
      deduct: true,
      job: false,
    },
    {
      key: 'live-preparing',
      status: 'PREPARING',
      orderMode: 'DELIVERY',
      paymentMethod: 'PAYHERE',
      placedAt: hoursAgo(3),
      product: products[(storeIndex + 2) % products.length],
      qty: 1,
      deduct: true,
      job: false,
    },
    {
      key: 'live-takeaway-cash',
      status: 'RECEIVED',
      orderMode: 'TAKEAWAY',
      paymentMethod: 'CASH_AT_COUNTER',
      placedAt: hoursAgo(1),
      product: cheap,
      qty: 1,
      deduct: true,
      job: false,
    },
  ];

  for (let daysAgo = 0; daysAgo < TREND_DAYS; daysAgo += 1) {
    const placedAt = placedInColombo(daysAgo, 11 + ((storeIndex + daysAgo) % 9), 10 + ((daysAgo * 7) % 40));
    const weekday = placedAt.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const recent = daysAgo < 14;
    const product = products[(storeIndex + daysAgo) % products.length];
    const takeaway = daysAgo % 3 === 2;
    const cancelled = daysAgo % 11 === 0 && daysAgo > 3;
    const cashTakeaway = takeaway && (cheap.basePrice || 450) < 1000;
    specs.push({
      key: `d${daysAgo}-a`,
      status: cancelled ? 'CANCELLED' : 'DELIVERED',
      orderMode: takeaway ? 'TAKEAWAY' : 'DELIVERY',
      paymentMethod: takeaway
        ? (cashTakeaway ? 'CASH_AT_COUNTER' : 'PAYHERE')
        : daysAgo % 2 === 0 ? 'PAYHERE' : 'CARD',
      placedAt,
      product: takeaway && cashTakeaway ? cheap : product,
      qty: recent || isWeekend ? 2 : 1,
      deduct: false,
      job: !takeaway && !cancelled,
    });

    if (isWeekend || (recent && daysAgo % 2 === 1)) {
      specs.push({
        key: `d${daysAgo}-b`,
        status: 'DELIVERED',
        orderMode: 'DELIVERY',
        paymentMethod: 'PAYHERE',
        placedAt: placedInColombo(daysAgo, 18, 20 + (storeIndex % 25)),
        product: products[(storeIndex + daysAgo + 5) % products.length],
        qty: 1,
        deduct: false,
        job: true,
      });
    }
  }

  return specs;
}

async function seedStoreOrders(
  store: StoreRow,
  index: number,
  passwordHash: string,
  products: Array<{ id: string; name: string; basePrice: number }>,
): Promise<number> {
  const already = await prisma.order.count({
    where: { storeId: store.id, notes: { startsWith: SEED_NOTE } },
  });
  if (already >= MIN_TREND_ORDERS) {
    console.log(`  skip ${store.name} (already has ${already} seed-main orders)`);
    return 0;
  }
  if (already > 0) {
    const partial = await prisma.order.findMany({
      where: { storeId: store.id, notes: { startsWith: SEED_NOTE } },
      select: { id: true },
    });
    const partialIds = partial.map((row) => row.id);
    const allocs = await prisma.stockBatchAllocation.findMany({
      where: { orderId: { in: partialIds } },
      select: { batchId: true, quantity: true, reversedQty: true },
    });
    for (const alloc of allocs) {
      const restore = alloc.quantity - alloc.reversedQty;
      if (restore <= 0) continue;
      await prisma.stockBatch.update({
        where: { id: alloc.batchId },
        data: {
          remainingQty: { increment: restore },
          status: 'ACTIVE',
        },
      });
    }
    await prisma.walletTransaction.deleteMany({ where: { orderId: { in: partialIds } } });
    await prisma.deliveryJob.deleteMany({
      where: {
        storeId: store.id,
        title: { startsWith: 'Seed completed run' },
      },
    });
    await prisma.order.deleteMany({ where: { id: { in: partialIds } } });
    await syncCachedStock(store.id);
  }

  const { user, address, lat, lng } = await ensureBranchCustomer(store, index, passwordHash);
  const cheap = [...products].sort((a, b) => a.basePrice - b.basePrice)[0] ?? products[0];
  const driver = await prisma.adminUser.findFirst({
    where: { storeId: store.id, isActive: true, role: { name: 'DELIVERY_DRIVER' } },
    select: { id: true },
  });

  const specs = buildTrendSpecs(index, products, cheap);
  const deliveredJobs: Array<{ id: string; placedAt: Date }> = [];

  for (const spec of specs) {
    const unit = spec.product.basePrice || 450;
    const subtotal = unit * spec.qty;
    const deliveryFee = spec.orderMode === 'DELIVERY' ? 200 : 0;
    const fee = convenientFee(spec.orderMode, spec.paymentMethod, subtotal);
    const total = subtotal + deliveryFee + fee;
    const online = spec.paymentMethod === 'PAYHERE' || spec.paymentMethod === 'CARD';
    const paymentStatus: PaymentStatus =
      spec.status === 'CANCELLED' ? 'REFUNDED'
        : spec.paymentMethod === 'CASH_AT_COUNTER'
          ? (spec.status === 'DELIVERED' ? 'PAID' : 'PENDING')
          : 'PAID';
    const prepaidAmount = online && paymentStatus !== 'REFUNDED' ? total : 0;
    const isDelivery = spec.orderMode === 'DELIVERY';
    const finishedAt = new Date(spec.placedAt.getTime() + 45 * 60_000);

    const order = await prisma.order.create({
      data: {
        orderNumber: await uniqueOrderNumber(spec.placedAt),
        trackToken: crypto.randomBytes(16).toString('hex'),
        userId: user.id,
        guestName: user.name,
        guestPhone: user.phone,
        storeId: store.id,
        addressId: isDelivery ? address.id : null,
        orderMode: spec.orderMode,
        status: spec.status,
        paymentMethod: spec.paymentMethod,
        paymentGateway: online ? 'PAYHERE' : null,
        paymentStatus,
        paymentRef: online ? `${SEED_NOTE}${storeSlug(store.name)}-${spec.key}` : null,
        prepaidAmount,
        subtotal,
        deliveryFee,
        convenientFee: fee,
        discount: 0,
        loyaltyDiscount: 0,
        total,
        estimatedMinutes: 30,
        notes: `${SEED_NOTE}${spec.key}`,
        deliveryAddressLine: isDelivery ? address.addressLine : null,
        deliveryCity: isDelivery ? store.city : null,
        deliveryDistrict: isDelivery ? store.district : null,
        deliveryLat: isDelivery ? lat : null,
        deliveryLng: isDelivery ? lng : null,
        channel: spec.key.includes('live-ready') || spec.key.endsWith('-b') ? 'APP' : 'WEB',
        cancelReason: spec.status === 'CANCELLED' ? 'CUSTOMER_REQUEST' : null,
        createdAt: spec.placedAt,
        updatedAt: spec.status === 'RECEIVED' ? spec.placedAt : finishedAt,
        items: {
          create: [
            {
              productId: spec.product.id,
              productName: spec.product.name,
              size: 'REGULAR',
              quantity: spec.qty,
              unitPrice: unit,
              totalPrice: subtotal,
            },
          ],
        },
        statusEvents: {
          create: statusEvents(spec.orderMode, spec.status, spec.placedAt),
        },
      },
      select: { id: true, items: { select: { id: true, productId: true, quantity: true } } },
    });

    if (spec.deduct) {
      await deductSeedFifo(
        store.id,
        order.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          orderItemId: item.id,
        })),
        order.id,
      );
    }
    if (spec.job) deliveredJobs.push({ id: order.id, placedAt: spec.placedAt });
  }

  const byWeek = new Map<string, Array<{ id: string; placedAt: Date }>>();
  for (const row of deliveredJobs) {
    const p = colomboParts(row.placedAt);
    const week = `${p.year}-${String(Math.ceil(p.day / 7)).padStart(2, '0')}-${p.month}`;
    const list = byWeek.get(week) ?? [];
    list.push(row);
    byWeek.set(week, list);
  }
  for (const [week, rows] of byWeek) {
    const start = rows[0].placedAt;
    const end = new Date(rows[rows.length - 1].placedAt.getTime() + 50 * 60_000);
    await prisma.deliveryJob.create({
      data: {
        storeId: store.id,
        driverId: driver?.id ?? null,
        title: `Seed completed run — ${store.name} ${week}`,
        status: 'COMPLETED',
        scheduledAt: start,
        assignedAt: start,
        startedAt: start,
        completedAt: end,
        jobOrders: {
          create: rows.map((row, seq) => ({ orderId: row.id, sequence: seq + 1 })),
        },
      },
    });
  }

  console.log(`  ${store.name}: ${specs.length} customer orders`);
  return specs.length;
}

async function backfillWallets(): Promise<void> {
  console.log('\nBackfilling store wallets from PAID PAYHERE/CARD orders...');
  const paidOrders = await prisma.order.findMany({
    where: {
      paymentStatus: 'PAID',
      paymentMethod: { in: ['CARD', 'PAYHERE'] },
    },
    select: {
      id: true,
      orderNumber: true,
      storeId: true,
      total: true,
      paymentMethod: true,
      paymentRef: true,
      createdAt: true,
    },
    orderBy: [{ storeId: 'asc' }, { createdAt: 'asc' }],
  });

  await prisma.walletTransaction.deleteMany();

  const byStore = new Map<string, typeof paidOrders>();
  for (const order of paidOrders) {
    const list = byStore.get(order.storeId) ?? [];
    list.push(order);
    byStore.set(order.storeId, list);
  }

  const stores = await prisma.store.findMany({ select: { id: true } });
  for (const store of stores) {
    const orders = byStore.get(store.id) ?? [];
    let running = 0;
    const txs = orders.map((order) => {
      const cents = order.total * 100;
      running += cents;
      return {
        id: crypto.randomUUID(),
        storeId: store.id,
        orderId: order.id,
        type: 'ORDER_PAYMENT' as const,
        amount: centsToDecimal(cents),
        balanceAfter: centsToDecimal(running),
        paymentMethod: order.paymentMethod,
        paymentRef: order.paymentRef,
        description: `Order #${order.orderNumber}`,
        reference: order.orderNumber,
        createdAt: order.createdAt,
      };
    });
    if (txs.length > 0) {
      await prisma.walletTransaction.createMany({ data: txs });
    }
    await prisma.storeWallet.upsert({
      where: { storeId: store.id },
      create: {
        id: crypto.randomUUID(),
        storeId: store.id,
        balance: centsToDecimal(running),
        totalEarnings: centsToDecimal(running),
      },
      update: {
        balance: centsToDecimal(running),
        totalEarnings: centsToDecimal(running),
        totalWithdrawn: centsToDecimal(0),
      },
    });
  }
  console.log(`  ${paidOrders.length} wallet credits written`);
}

async function printVerify(): Promise<void> {
  const canonical = canonicalStoreNames();
  const [cod, demoActive, readyPaid, batches, stockRows, oldest, newest, orderCount] = await Promise.all([
    prisma.order.count({ where: { paymentMethod: 'CASH_ON_DELIVERY' } }),
    prisma.store.count({ where: { isActive: true, name: { notIn: [...canonical] } } }),
    prisma.order.count({
      where: { orderMode: 'DELIVERY', status: 'READY', paymentStatus: 'PAID' },
    }),
    prisma.stockBatch.count({ where: { status: 'ACTIVE', batchType: 'RESET' } }),
    prisma.storeProduct.findMany({
      where: { store: { isActive: true } },
      select: { storeId: true, productId: true, stock: true },
    }),
    prisma.order.findFirst({
      where: { notes: { startsWith: SEED_NOTE } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.order.findFirst({
      where: { notes: { startsWith: SEED_NOTE } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.order.count({ where: { notes: { startsWith: SEED_NOTE } } }),
  ]);

  let mismatches = 0;
  const sample = stockRows.slice(0, 40);
  for (const row of sample) {
    const agg = await prisma.stockBatch.aggregate({
      where: { storeId: row.storeId, productId: row.productId, status: 'ACTIVE' },
      _sum: { remainingQty: true },
    });
    if ((agg._sum.remainingQty ?? 0) !== row.stock) mismatches += 1;
  }

  console.log('\nVerify');
  console.log(`  COD orders: ${cod}`);
  console.log(`  active demo stores: ${demoActive}`);
  console.log(`  seed-main orders: ${orderCount}`);
  console.log(`  order span: ${oldest?.createdAt.toISOString() ?? 'none'} → ${newest?.createdAt.toISOString() ?? 'none'}`);
  console.log(`  READY+PAID delivery: ${readyPaid}`);
  console.log(`  ACTIVE RESET batches: ${batches}`);
  console.log(`  stock invariant mismatches (first ${sample.length} rows): ${mismatches}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('Reseed main branches', {
    clear: args.clear,
    stock: args.stock,
    orders: args.orders,
    from: args.from ?? null,
  });

  if (args.clear) {
    if (args.from) {
      throw new Error('--from cannot be combined with --clear');
    }
    await clearOperationalData();
  }

  if (args.stock) {
    const stores = await listMainStores(args.from);
    console.log(`\nReceiving RESET batches for ${stores.length} main branch(es)...`);
    const failures: string[] = [];
    for (const store of stores) {
      try {
        await restockStore(store);
      } catch (err) {
        const message = `${store.name}: ${(err as Error).message}`;
        failures.push(message);
        console.error(`  FAIL ${message}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`Stock failed for ${failures.length} branch(es). Resume with --stock --from "<name>".`);
    }
  }

  if (args.orders) {
    const stores = await listMainStores(args.from);
    const products = await prisma.product.findMany({
      where: { isAvailable: true },
      select: { id: true, name: true, basePrice: true },
      orderBy: { name: 'asc' },
    });
    if (products.length === 0) throw new Error('No available products');

    const passwordHash = await bcrypt.hash(DEMO_CUSTOMER.password, 12);
    await ensureDemoCustomer(passwordHash);
    console.log(`\nSeeding customer orders for ${stores.length} main branch(es)...`);

    const failures: string[] = [];
    for (let i = 0; i < stores.length; i += 1) {
      try {
        await seedStoreOrders(stores[i], i, passwordHash, products);
      } catch (err) {
        const message = `${stores[i].name}: ${(err as Error).message}`;
        failures.push(message);
        console.error(`  FAIL ${message}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`Orders failed for ${failures.length} branch(es). Resume with --orders --from "<name>".`);
    }
    await backfillWallets();
  }

  await printVerify();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
