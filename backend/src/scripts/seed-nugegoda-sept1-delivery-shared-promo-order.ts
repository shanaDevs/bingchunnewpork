/**
 * One PAID online DELIVERY order at Nugegoda (1 Sep) with SHARED promo
 * (65% branch / 35% platform), then customer cancel + refund COMPLETE.
 *
 *   npm run seed:nuge-sept1-delivery-shared -w @bingchun/backend
 *   npm run seed:nuge-sept1-delivery-shared -w @bingchun/backend -- --year=2026 --clean
 */
import crypto from 'crypto';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import type { OrderMode, PaymentMethod } from '@prisma/client';
import { placeOrder } from '../controllers/orderController';
import { getActiveCancelReasons } from '../lib/cancelReasonConfig';
import { markOnlineOrderPaid } from '../lib/onlineOrderPayment';
import { updatePaymentSettings } from '../lib/paymentSettings';
import { prisma } from '../lib/prisma';
import { syncStoreProducts } from '../lib/storeInventory';
import { recalculateWalletBalance } from '../lib/walletSync';
import { normalizePhone } from '../utils/phone';
import {
  advanceToPreparing,
  completeRefundForOrder,
  customerCancelOrder,
  expireCancelWindow,
  patchPrismaTransactionTimeout,
  resolveBranchStaff,
  shiftRefundTimelines,
} from './lib/nugeDeliverySeedRefundFlow';
import { runHandler, type HarnessUser } from './lib/seedControllerHarness';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const SEED_NOTE = 'seed-nuge-sept1-shared-delivery-';
const SEPT_DAY = 1;
const SEPT_MONTH = 9;
const WALK_IN_PHONE = '0771000401';
const SHARED_PROMO_CODE = 'SEEDNUG-SEP1-SHR-6535';
const BRANCH_SHARE_PCT = 65;
const PLATFORM_SHARE_PCT = 35;
const WEEKLY_TARGET_QTY = 80;
const RESET_QTY = 2000;
const MIN_DELIVERY_SUBTOTAL = 550;

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
  storeManager: HarnessUser & { type: 'admin' };
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

async function ensureSharedPromo(storeId: string): Promise<void> {
  await prisma.promoCode.upsert({
    where: { code: SHARED_PROMO_CODE },
    update: {
      isActive: true,
      deletedAt: null,
      ownership: 'SHARED',
      branchSharePct: BRANCH_SHARE_PCT,
      platformSharePct: PLATFORM_SHARE_PCT,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderValue: 500,
      promotionKind: 'PERCENTAGE_DISCOUNT',
      storeIds: [storeId],
      contributionSource: 'PLATFORM',
    },
    create: {
      code: SHARED_PROMO_CODE,
      title: 'Seed — Sep 1 shared 65% branch / 35% platform',
      description: 'SHARED delivery promo (seed)',
      ownership: 'SHARED',
      branchSharePct: BRANCH_SHARE_PCT,
      platformSharePct: PLATFORM_SHARE_PCT,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderValue: 500,
      promotionKind: 'PERCENTAGE_DISCOUNT',
      isActive: true,
      showOnHome: false,
      storeIds: [storeId],
      contributionSource: 'PLATFORM',
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
  const email = 'seed.nuge.sept1.shared@bingchun-test.lk';
  let user = await prisma.user.findFirst({ where: { OR: [{ phone: seedPhone }, { email }] } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Sept 1 Shared Delivery Seed',
        phone: seedPhone,
        email,
        passwordHash: await bcrypt.hash('Customer@123', 10),
        isPhoneVerified: true,
      },
    });
  }

  const addressLine = `12 Shared Promo Lane, ${store.city}`;
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

  const staff = await resolveBranchStaff(store.id);

  return {
    customerId: user.id,
    addressId: address.id,
    customer: { sub: user.id, type: 'user' },
    storeManager: {
      sub: staff.managerId,
      type: 'admin',
      role: 'STORE_MANAGER',
      storeId: store.id,
    },
    branchStaff: {
      sub: staff.branchStaffId,
      type: 'admin',
      role: staff.branchRole,
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
  await prisma.refund.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
}

async function main() {
  assertDevSeedOnly();
  patchPrismaTransactionTimeout();
  const { year, clean } = parseArgs();
  const store = await resolveNugegoda();
  const note = `${SEED_NOTE}${year}-09-01-shr6535`;
  const placedAt = placedInColombo(year, SEPT_MONTH, SEPT_DAY, 11, 30);

  console.log(`Store: ${store.name}`);
  console.log(`Target: ${year}-09-01 (Colombo)`);
  console.log(`Promo: ${SHARED_PROMO_CODE} (SHARED ${BRANCH_SHARE_PCT}% branch / ${PLATFORM_SHARE_PCT}% platform)\n`);

  const existing = await prisma.order.findFirst({
    where: { storeId: store.id, notes: note },
    select: { id: true, orderNumber: true },
  });
  if (existing && !clean) {
    console.log(`Already seeded: ${existing.orderNumber} — use --clean to replace.`);
    return;
  }
  if (existing && clean) {
    await deleteSeedOrder(existing.id);
    console.log(`Removed prior ${existing.orderNumber}\n`);
  }

  await ensureOnlineCheckoutEnabled();
  await ensureSharedPromo(store.id);
  await restockStore(store);
  const actors = await ensureActors(store);
  const products = await loadProducts(store.id);
  const product = products[0];
  const quantity = quantityForSubtotal(product.basePrice, SEPT_DAY);

  const cancelReasons = await getActiveCancelReasons();
  const cancelReason =
    cancelReasons.find((r) => r.value === 'CHANGED_MIND')?.value ?? cancelReasons[0]?.value ?? 'CHANGED_MIND';

  const orderId = await placePaidDelivery({
    store,
    actors,
    product,
    quantity,
    note,
    promoCode: SHARED_PROMO_CODE,
  });
  await advanceToPreparing(orderId, actors.branchStaff);
  await expireCancelWindow(orderId);
  await customerCancelOrder(orderId, actors.customer, cancelReason);
  await completeRefundForOrder(orderId, actors.storeManager);
  await shiftRefundTimelines(orderId, placedAt);

  const row = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderNumber: true,
      orderMode: true,
      paymentMethod: true,
      status: true,
      paymentStatus: true,
      discount: true,
      total: true,
      createdAt: true,
      promoCode: true,
      refund: { select: { status: true, refundAmount: true } },
    },
  });
  const usage = await prisma.promotionUsage.findFirst({
    where: { orderId },
    select: {
      ownership: true,
      branchSharePct: true,
      platformSharePct: true,
      totalDiscountAmount: true,
      branchShareAmount: true,
      platformShareAmount: true,
      contributionSource: true,
    },
  });

  await recalculateWalletBalance(store.id);

  console.log('✅ Created paid online delivery (SHARED promo) with refund COMPLETE');
  console.log(`   ${row.orderNumber}  ${row.orderMode}  ${row.paymentMethod}`);
  console.log(`   ${row.status} / ${row.paymentStatus}  promo ${row.promoCode}`);
  console.log(`   discount LKR ${row.discount}  total LKR ${row.total}`);
  console.log(`   createdAt: ${row.createdAt.toISOString()}`);
  if (row.refund) {
    console.log(`   refund: ${row.refund.status}  LKR ${row.refund.refundAmount}`);
  }
  if (usage) {
    console.log(
      `   promotion: ${usage.ownership}  branch ${usage.branchSharePct}% (LKR ${usage.branchShareAmount})  ` +
        `platform ${usage.platformSharePct}% (LKR ${usage.platformShareAmount})  source=${usage.contributionSource}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
