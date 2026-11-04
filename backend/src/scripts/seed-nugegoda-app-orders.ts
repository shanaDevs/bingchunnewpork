/**
 * Nugegoda monthly seed through application controllers.
 *
 * Dev:
 *   set ALLOW_NUGEGODA_APP_SEED=true
 *   npm run seed:nugegoda-app -w @bingchun/backend
 *
 * Live (DO shop-api console):
 *   export ALLOW_NUGEGODA_APP_SEED=true ALLOW_SEED_ON_LIVE=true
 *   npm run seed:nugegoda-app:prod
 *
 * Options: --dry-run --skip-clear --target-lkr=1000000 --months=2
 */
import crypto from 'crypto';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import type { OrderMode, OrderStatus, PaymentMethod } from '@prisma/client';
import {
  cancelOrderByCustomer,
  placeOrder,
  updateOrderStatus,
} from '../controllers/orderController';
import { updateRefundStatus } from '../controllers/refundController';
import { getActiveCancelReasons } from '../lib/cancelReasonConfig';
import { markOnlineOrderPaid } from '../lib/onlineOrderPayment';
import { CUSTOMER_CANCEL_WINDOW_MS } from '../lib/orderCancel';
import { prisma } from '../lib/prisma';
import { isLoyaltyPromoCode } from '../lib/loyaltyCampaign';
import { isPromoAvailableAtStore } from '../lib/promotionUsage';
import { isSpinLinkedPromo } from '../lib/spinOfferPromo';
import { syncStoreProducts } from '../lib/storeInventory';
import { normalizePhone } from '../utils/phone';
import { runHandler, type HarnessUser } from './lib/seedControllerHarness';
import { assertNugegodaAppSeedAllowed } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const SEED_NOTE = 'seed-nuge-app-';
const WEEKLY_TARGET_QTY = 80;
const RESET_QTY = 2000;
const DEFAULT_TARGET_LKR = 1_000_000;
const PAYMENT_METHODS: PaymentMethod[] = ['PAYHERE', 'CARD'];
const WALK_IN_PHONE = '0700000000';

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

type ProductPick = {
  productId: string;
  name: string;
  basePrice: number;
};

type Actors = {
  customer: HarnessUser & { type: 'user' };
  customerId: string;
  addressId: string;
  storeManager: HarnessUser & { type: 'admin' };
  branchStaff: HarnessUser & { type: 'admin' };
};

type MonthPlan = { year: number; month: number; key: string };

function parseArgs() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  let targetLkr = DEFAULT_TARGET_LKR;
  let months = 2;
  for (const arg of argv) {
    if (arg.startsWith('--target-lkr=')) targetLkr = Number(arg.split('=')[1]) || DEFAULT_TARGET_LKR;
    if (arg.startsWith('--months=')) months = Math.max(1, Number(arg.split('=')[1]) || 2);
  }
  return {
    dryRun: flags.has('--dry-run'),
    skipClear: flags.has('--skip-clear'),
    targetLkr,
    months,
  };
}

function targetStoreName(): string {
  return process.env.SEED_TARGET_STORE_NAME?.trim() || 'Nugegoda';
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
  return { year: num('year'), month: num('month'), day: num('day') };
}

function placedInColombo(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');
  return new Date(`${year}-${mm}-${dd}T${hh}:${min}:00+05:30`);
}

function listTargetMonths(count: number): MonthPlan[] {
  const now = colomboParts();
  const plans: MonthPlan[] = [];
  for (let i = count; i >= 1; i -= 1) {
    const d = new Date(Date.UTC(now.year, now.month - 1 - (i - 1), 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    plans.push({ year: y, month: m, key: `${y}${String(m).padStart(2, '0')}` });
  }
  return plans;
}

function seedOrderWhere(storeId: string) {
  return {
    storeId,
    OR: [
      { id: { startsWith: 'seed-' } },
      { notes: { startsWith: 'seed-' } },
      { paymentRef: { startsWith: 'seed-' } },
    ],
  };
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

async function clearNugegodaSeedData(storeId: string): Promise<number> {
  const seedOrders = await prisma.order.findMany({
    where: seedOrderWhere(storeId),
    select: { id: true },
  });
  if (seedOrders.length === 0) return 0;
  const orderIds = seedOrders.map((o) => o.id);

  const allocs = await prisma.stockBatchAllocation.findMany({
    where: { orderId: { in: orderIds } },
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

  await prisma.walletTransaction.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { id: { startsWith: 'seed-' } }] },
  });
  await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.promotionUsage.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.deliveryJobOrder.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.deliveryJob.deleteMany({
    where: { storeId, OR: [{ id: { startsWith: 'seed-' } }, { title: { contains: 'seed' } }] },
  });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await syncCachedStock(storeId);
  return orderIds.length;
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
  if (products.length === 0) throw new Error(`No store_products for ${store.name}`);

  const existing = await prisma.stockBatch.findMany({
    where: { storeId: store.id, status: 'ACTIVE', remainingQty: { gt: 500 } },
    select: { productId: true },
  });
  const stocked = new Set(existing.map((r) => r.productId));
  const missing = products.filter((r) => !stocked.has(r.productId));
  if (missing.length === 0) {
    await syncCachedStock(store.id);
    console.log(`  stock OK (${existing.length} active batches)`);
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
    where: { id: { in: missing.map((r) => r.productId) } },
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
      note: `${SEED_NOTE}RESET restock`,
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
  console.log(`  restocked ${missing.length} products (${groupNumber})`);
}

async function resolveTargetStore(): Promise<StoreRow> {
  const needle = targetStoreName();
  const store = await prisma.store.findFirst({
    where: { name: { contains: needle }, isActive: true },
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
  });
  if (!store) throw new Error(`No active store matching "${needle}"`);
  return store;
}

async function ensureActors(store: StoreRow): Promise<Actors> {
  const seedPhone = normalizePhone(process.env.SEED_CUSTOMER_PHONE?.trim() || WALK_IN_PHONE);
  const passwordHash = await bcrypt.hash('Customer@123', 10);
  const email = `seed.nuge.app@bingchun-test.lk`;
  let user = await prisma.user.findFirst({ where: { OR: [{ phone: seedPhone }, { email }] } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Nugegoda App Seed Customer',
        phone: seedPhone,
        email,
        passwordHash,
        isPhoneVerified: true,
      },
    });
  } else if (user.phone !== seedPhone) {
    await prisma.user.update({ where: { id: user.id }, data: { phone: seedPhone } });
  }

  const lat = store.lat + 0.002;
  const lng = store.lng + 0.0015;
  const addressLine = `14 App Seed Lane, ${store.city}`;
  let address = await prisma.address.findFirst({ where: { userId: user.id, addressLine } });
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

  const manager = await prisma.adminUser.findFirst({
    where: { storeId: store.id, isActive: true, role: { name: 'STORE_MANAGER' } },
    select: { id: true },
  });
  if (!manager) {
    throw new Error(`No STORE_MANAGER for ${store.name} — ensure branch admin exists`);
  }

  const cashier = await prisma.adminUser.findFirst({
    where: { storeId: store.id, isActive: true, role: { name: 'CASHIER' } },
    select: { id: true },
  });
  const branchStaffId = cashier?.id ?? manager.id;
  const branchRole = cashier ? 'CASHIER' : 'STORE_MANAGER';

  return {
    customerId: user.id,
    addressId: address.id,
    customer: { sub: user.id, type: 'user' },
    storeManager: { sub: manager.id, type: 'admin', role: 'STORE_MANAGER', storeId: store.id },
    branchStaff: { sub: branchStaffId, type: 'admin', role: branchRole, storeId: store.id },
  };
}

async function loadPromoCodes(storeId: string): Promise<string[]> {
  const now = new Date();
  const promos = await prisma.promoCode.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      ],
    },
    select: {
      code: true,
      storeIds: true,
      maxUses: true,
      usedCount: true,
      promotionKind: true,
      promotionRules: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
  return promos
    .filter((p) => isPromoAvailableAtStore(p.storeIds, storeId))
    .filter((p) => !isSpinLinkedPromo(p))
    .filter((p) => !isLoyaltyPromoCode(p.code))
    .filter((p) => p.maxUses == null || p.usedCount < p.maxUses)
    .map((p) => p.code);
}

async function loadProducts(storeId: string): Promise<ProductPick[]> {
  const rows = await prisma.storeProduct.findMany({
    where: { storeId, isAvailable: true, stock: { gt: 0 } },
    include: { product: { select: { id: true, name: true, basePrice: true, isAvailable: true } } },
  });
  return rows
    .filter((r) => r.product.isAvailable)
    .map((r) => ({
      productId: r.product.id,
      name: r.product.name,
      basePrice: r.product.basePrice,
    }))
    .sort((a, b) => b.basePrice - a.basePrice);
}

async function zeroConvenienceFeeForOrder(orderId: string): Promise<number> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      subtotal: true,
      deliveryFee: true,
      discount: true,
      loyaltyDiscount: true,
      convenientFee: true,
      total: true,
    },
  });
  if (!order.convenientFee) return order.total;
  const total = Math.max(0, order.subtotal + order.deliveryFee - order.discount - order.loyaltyDiscount);
  await prisma.order.update({
    where: { id: orderId },
    data: { convenientFee: 0, total },
  });
  return total;
}

function takeawayScheduling(at?: Date): { scheduleMode: 15; scheduledAt: string } {
  const base = at ?? new Date();
  const scheduledAt = new Date(base.getTime() + 30 * 60 * 1000).toISOString();
  return { scheduleMode: 15, scheduledAt };
}

async function placeOnlineOrder(input: {
  store: StoreRow;
  actors: Actors;
  orderMode: OrderMode;
  paymentMethod: PaymentMethod;
  product: ProductPick;
  quantity: number;
  note: string;
  promoCode?: string;
  /** Use backdated slot for takeaway (avoids failing when seed runs after branch close). */
  takeawayAt?: Date;
}): Promise<{
  id: string;
  orderNumber: string;
  total: number;
  orderMode: OrderMode;
  storeId: string;
  userId: string | null;
  paymentMethod: PaymentMethod;
}> {
  const { store, actors, orderMode, paymentMethod, product, quantity, note, promoCode, takeawayAt } =
    input;
  const items = [{ productId: product.productId, size: 'REGULAR' as const, toppingIds: [] as string[], quantity }];

  const body: Record<string, unknown> = {
    orderMode,
    storeId: store.id,
    items,
    paymentMethod,
    channel: 'APP',
    notes: note,
    platform: 0,
    skipLoyaltyAutoApply: true,
  };
  if (promoCode) body.promoCode = promoCode;
  if (orderMode === 'TAKEAWAY') {
    Object.assign(body, takeawayScheduling(takeawayAt));
  }
  if (orderMode === 'DELIVERY') {
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
  }

  const maxAttempts = 6;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const data = await runHandler<{
        order: {
          id: string;
          orderNumber: string;
          total: number;
          orderMode: OrderMode;
          storeId: string;
          userId: string | null;
          paymentMethod: PaymentMethod;
        };
      }>(placeOrder, {
        body,
        user: actors.customer,
        headers: { 'idempotency-key': crypto.randomUUID() },
      });

      const order = data.order;
      const total = await zeroConvenienceFeeForOrder(order.id);
      const paymentRef = `${SEED_NOTE}pay-${crypto.randomUUID()}`;
      await markOnlineOrderPaid(
        {
          id: order.id,
          orderNumber: order.orderNumber,
          storeId: order.storeId,
          total,
          paymentMethod: order.paymentMethod,
          userId: order.userId,
          orderMode: order.orderMode,
        },
        { paymentRef },
      );

      return prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          orderMode: true,
          storeId: true,
          userId: true,
          paymentMethod: true,
        },
      });
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const orderNumConflict =
        msg.includes('orderNumber') ||
        (typeof err === 'object' &&
          err !== null &&
          (err as { code?: string; meta?: { target?: string[] } }).code === 'P2002' &&
          (err as { meta?: { target?: string[] } }).meta?.target?.includes('orderNumber'));
      if (attempt < maxAttempts - 1 && orderNumConflict) continue;
      throw err;
    }
  }
  throw lastErr;
}

async function setStatus(
  orderId: string,
  status: OrderStatus,
  staff: HarnessUser & { type: 'admin' },
  extra?: { cancelReason?: 'OUT_OF_STOCK' | 'CUSTOMER_REQUEST' | 'PAYMENT_OR_SYSTEM_ISSUE'; note?: string },
): Promise<void> {
  await runHandler(updateOrderStatus, {
    method: 'PUT',
    params: { id: orderId },
    user: staff,
    body: { status, note: extra?.note, cancelReason: extra?.cancelReason },
  });
}

async function advanceTo(
  orderId: string,
  orderMode: OrderMode,
  target: OrderStatus,
  staff: HarnessUser & { type: 'admin' },
): Promise<void> {
  const flow: OrderStatus[] =
    orderMode === 'DELIVERY'
      ? ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED']
      : ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED'];

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  const start = flow.indexOf(order.status as OrderStatus);
  const end = flow.indexOf(target);
  if (start < 0 || end < 0 || end <= start) return;
  for (let i = start + 1; i <= end; i += 1) {
    await setStatus(orderId, flow[i], staff);
  }
}

async function completeRefund(
  refundId: string,
  manager: HarnessUser & { type: 'admin' },
  status: 'COMPLETE' | 'REJECTED',
  adminNotes?: string,
): Promise<void> {
  const body: Record<string, unknown> = { status };
  if (status === 'REJECTED') {
    body.adminNotes = adminNotes ?? 'Seed: rejected within cancel window';
  }
  await runHandler(updateRefundStatus, {
    method: 'PUT',
    params: { id: refundId },
    user: manager,
    body,
  });
}

async function customerCancel(
  orderId: string,
  customer: HarnessUser & { type: 'user' },
  cancellationReason: string,
): Promise<void> {
  await runHandler(cancelOrderByCustomer, {
    method: 'POST',
    params: { id: orderId },
    user: customer,
    body: { cancellationReason },
  });
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

  const events = await prisma.orderStatusEvent.findMany({ where: { orderId }, select: { id: true, createdAt: true } });
  for (const ev of events) {
    await prisma.orderStatusEvent.update({
      where: { id: ev.id },
      data: { createdAt: new Date(ev.createdAt.getTime() + delta) },
    });
  }

  const refund = await prisma.refund.findUnique({
    where: { orderId },
    select: { id: true, createdAt: true, updatedAt: true, processedAt: true },
  });
  if (refund) {
    await prisma.refund.update({
      where: { id: refund.id },
      data: {
        createdAt: new Date(refund.createdAt.getTime() + delta),
        updatedAt: new Date(refund.updatedAt.getTime() + delta),
        processedAt: refund.processedAt ? new Date(refund.processedAt.getTime() + delta) : null,
      },
    });
  }
}

async function expireCancelWindow(orderId: string): Promise<void> {
  const past = new Date(Date.now() - CUSTOMER_CANCEL_WINDOW_MS - 5 * 60 * 1000);
  await prisma.order.update({
    where: { id: orderId },
    data: { cancelWindowStartsAt: past },
  });
}

async function refundIdForOrder(orderId: string): Promise<string> {
  const refund = await prisma.refund.findUnique({ where: { orderId }, select: { id: true } });
  if (!refund) throw new Error(`Expected refund for order ${orderId}`);
  return refund.id;
}

async function runRefundScenarios(ctx: {
  store: StoreRow;
  actors: Actors;
  products: ProductPick[];
  month: MonthPlan;
  cancelReason: string;
  seqStart: number;
}): Promise<number> {
  const { store, actors, products, month, cancelReason } = ctx;
  let seq = ctx.seqStart;
  const pick = (i: number) => products[i % products.length];
  const dayBase = 3 + (month.month % 10);

  const scenarios: Array<{ tag: string; run: () => Promise<void> }> = [
    {
      tag: 'ref-A-rejected',
      run: async () => {
        const note = `${SEED_NOTE}${month.key}-${seq++}-ref-A-rejected`;
        const order = await placeOnlineOrder({
          store,
          actors,
          orderMode: 'DELIVERY',
          paymentMethod: 'PAYHERE',
          product: pick(0),
          quantity: 2,
          note,
        });
        await customerCancel(order.id, actors.customer, cancelReason);
        await completeRefund(await refundIdForOrder(order.id), actors.storeManager, 'REJECTED');
        await shiftTimelines(order.id, placedInColombo(month.year, month.month, dayBase, 10));
      },
    },
    {
      tag: 'ref-B-complete-late',
      run: async () => {
        const note = `${SEED_NOTE}${month.key}-${seq++}-ref-B-complete-late`;
        const order = await placeOnlineOrder({
          store,
          actors,
          orderMode: 'DELIVERY',
          paymentMethod: 'PAYHERE',
          product: pick(1),
          quantity: 2,
          note,
        });
        await advanceTo(order.id, order.orderMode, 'PREPARING', actors.branchStaff);
        await expireCancelWindow(order.id);
        await customerCancel(order.id, actors.customer, cancelReason);
        await completeRefund(await refundIdForOrder(order.id), actors.storeManager, 'COMPLETE');
        await shiftTimelines(order.id, placedInColombo(month.year, month.month, dayBase + 2, 12));
      },
    },
    {
      tag: 'ref-C-branch-complete',
      run: async () => {
        const note = `${SEED_NOTE}${month.key}-${seq++}-ref-C-branch-complete`;
        const order = await placeOnlineOrder({
          store,
          actors,
          orderMode: 'DELIVERY',
          paymentMethod: 'PAYHERE',
          product: pick(2),
          quantity: 2,
          note,
        });
        await advanceTo(order.id, order.orderMode, 'PREPARING', actors.branchStaff);
        await setStatus(order.id, 'CANCELLED', actors.branchStaff, {
          cancelReason: 'OUT_OF_STOCK',
          note: 'Branch reject — out of stock',
        });
        await completeRefund(await refundIdForOrder(order.id), actors.storeManager, 'COMPLETE');
        await shiftTimelines(order.id, placedInColombo(month.year, month.month, dayBase + 4, 14));
      },
    },
    {
      tag: 'ref-D-pending-branch',
      run: async () => {
        const note = `${SEED_NOTE}${month.key}-${seq++}-ref-D-pending-branch`;
        const order = await placeOnlineOrder({
          store,
          actors,
          orderMode: 'DELIVERY',
          paymentMethod: 'PAYHERE',
          product: pick(3),
          quantity: 1,
          note,
        });
        await advanceTo(order.id, order.orderMode, 'READY', actors.branchStaff);
        await setStatus(order.id, 'CANCELLED', actors.branchStaff, {
          cancelReason: 'PAYMENT_OR_SYSTEM_ISSUE',
          note: 'Branch cancel — pending refund',
        });
        await shiftTimelines(order.id, placedInColombo(month.year, month.month, dayBase + 6, 16));
      },
    },
    {
      tag: 'ref-E-pending-customer',
      run: async () => {
        const note = `${SEED_NOTE}${month.key}-${seq++}-ref-E-pending-customer`;
        const order = await placeOnlineOrder({
          store,
          actors,
          orderMode: 'DELIVERY',
          paymentMethod: 'PAYHERE',
          product: pick(4),
          quantity: 2,
          note,
        });
        await advanceTo(order.id, order.orderMode, 'PREPARING', actors.branchStaff);
        await expireCancelWindow(order.id);
        await customerCancel(order.id, actors.customer, cancelReason);
        await shiftTimelines(order.id, placedInColombo(month.year, month.month, dayBase + 8, 18));
      },
    },
  ];

  for (const s of scenarios) {
    console.log(`    refund scenario ${s.tag}`);
    await s.run();
  }
  return seq;
}

async function seedDeliveredGmv(ctx: {
  store: StoreRow;
  actors: Actors;
  products: ProductPick[];
  promos: string[];
  month: MonthPlan;
  targetLkr: number;
  seqStart: number;
}): Promise<{ seq: number; deliveredTotal: number }> {
  const { store, actors, products, promos, month, targetLkr } = ctx;
  let seq = ctx.seqStart;
  let deliveredTotal = 0;
  let day = 10;
  let promoIdx = 0;

  while (deliveredTotal < targetLkr) {
    const product = products[seq % products.length];
    const orderMode: OrderMode = seq % 5 === 0 ? 'TAKEAWAY' : 'DELIVERY';
    let paymentMethod = PAYMENT_METHODS[seq % PAYMENT_METHODS.length];
    const usePromo = promos.length > 0 && seq % 3 === 0;
    const promoCode = usePromo ? promos[promoIdx++ % promos.length] : undefined;

    let quantity = Math.max(2, Math.ceil((targetLkr - deliveredTotal) / Math.max(product.basePrice, 500) / 4));
    quantity = Math.min(quantity, 12);

    const note = `${SEED_NOTE}${month.key}-del-${String(seq).padStart(3, '0')}`;
    const placedAt = placedInColombo(month.year, month.month, Math.min(day, 26), 10 + (seq % 8), (seq * 7) % 60);

    let order;
    try {
      order = await placeOnlineOrder({
        store,
        actors,
        orderMode,
        paymentMethod,
        product,
        quantity,
        note,
        promoCode,
        takeawayAt: orderMode === 'TAKEAWAY' ? placedAt : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Insufficient stock')) {
        await restockStore(store);
        const alt = products[(seq + day + 1) % products.length];
        const retryQty = Math.min(quantity, 4);
        order = await placeOnlineOrder({
          store,
          actors,
          orderMode,
          paymentMethod,
          product: alt,
          quantity: retryQty,
          note,
          promoCode,
        });
      } else if (paymentMethod === 'CARD' && msg.includes('payment')) {
        paymentMethod = 'PAYHERE';
        order = await placeOnlineOrder({
          store,
          actors,
          orderMode,
          paymentMethod,
          product,
          quantity,
          note,
          promoCode,
        });
      } else if (promoCode) {
        order = await placeOnlineOrder({
          store,
          actors,
          orderMode,
          paymentMethod,
          product,
          quantity,
          note,
          takeawayAt: orderMode === 'TAKEAWAY' ? placedAt : undefined,
        });
      } else if (msg.includes('pickup slot')) {
        order = await placeOnlineOrder({
          store,
          actors,
          orderMode: 'DELIVERY',
          paymentMethod,
          product,
          quantity,
          note,
          promoCode,
        });
      } else {
        throw err;
      }
    }

    await advanceTo(order.id, order.orderMode, 'DELIVERED', actors.branchStaff);
    await shiftTimelines(order.id, placedAt);

    deliveredTotal += order.total;
    seq += 1;
    day += 1;
    if (seq > 250) {
      throw new Error(`GMV loop exceeded 250 orders; delivered ${deliveredTotal} / ${targetLkr}`);
    }
  }

  return { seq, deliveredTotal };
}

function patchPrismaTransactionTimeout(): void {
  const origTransaction = prisma.$transaction.bind(prisma);
  (prisma as unknown as { $transaction: typeof prisma.$transaction }).$transaction = (
    fn: Parameters<typeof origTransaction>[0],
    options?: Parameters<typeof origTransaction>[1],
  ) =>
    origTransaction(fn, {
      maxWait: 60_000,
      timeout: 120_000,
      ...(typeof options === 'object' && options !== null ? options : {}),
    });
}

async function main() {
  assertNugegodaAppSeedAllowed();
  patchPrismaTransactionTimeout();

  const args = parseArgs();
  const store = await resolveTargetStore();
  console.log(`Store: ${store.name} (${store.id})`);
  console.log(`Target: ${args.targetLkr} LKR delivered GMV per month × ${args.months} month(s)`);
  console.log(`NODE_ENV=${process.env.NODE_ENV ?? 'unset'}`);

  if (args.dryRun) {
    console.log('Dry run — no database changes.');
    return;
  }

  if (!args.skipClear) {
    const removed = await clearNugegodaSeedData(store.id);
    console.log(`Cleared ${removed} seed order(s) at ${store.name}`);
  }

  await restockStore(store);

  const actors = await ensureActors(store);
  const products = await loadProducts(store.id);
  if (products.length === 0) throw new Error('No available products with stock');
  const promos = await loadPromoCodes(store.id);
  console.log(`Products: ${products.length}, promos: ${promos.length}`);

  const cancelReasons = await getActiveCancelReasons();
  const cancelReason =
    cancelReasons.find((r) => r.value === 'CHANGED_MIND')?.value ?? cancelReasons[0]?.value ?? 'CHANGED_MIND';

  const months = listTargetMonths(args.months);
  for (const month of months) {
    console.log(`\n=== ${month.key} ===`);
    let seq = 1;
    seq = await runRefundScenarios({ store, actors, products, month, cancelReason, seqStart: seq });
    const { deliveredTotal } = await seedDeliveredGmv({
      store,
      actors,
      products,
      promos,
      month,
      targetLkr: args.targetLkr,
      seqStart: seq,
    });
    console.log(`  delivered GMV: LKR ${deliveredTotal.toLocaleString()}`);

    const badFees = await prisma.order.count({
      where: { storeId: store.id, notes: { startsWith: SEED_NOTE }, convenientFee: { gt: 0 } },
    });
    if (badFees > 0) {
      throw new Error(`${badFees} seed order(s) still have convenientFee > 0`);
    }

    const refundCounts = await prisma.refund.groupBy({
      by: ['status'],
      where: { order: { storeId: store.id, notes: { startsWith: SEED_NOTE } } },
      _count: true,
    });
    console.log('  refund statuses:', refundCounts.map((r) => `${r.status}=${r._count}`).join(', '));
  }

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
