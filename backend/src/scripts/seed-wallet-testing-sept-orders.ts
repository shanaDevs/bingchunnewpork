/**
 * Wallet testing: 30 paid DELIVERY orders (1 Sep – 30 Sep), via real app controllers.
 * Mix of delivered orders (with promos), cancellations, and refund outcomes.
 *
 *   set ALLOW_WALLET_TESTING_SEPT_SEED=true
 *   npm run seed:wallet-testing-sept -w @bingchun/backend
 *
 * Options: --clean  --year=2026  --store-name=Nugegoda  --store-id=<uuid>
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
import { recalculateWalletBalance } from '../lib/walletSync';
import { normalizePhone } from '../utils/phone';
import { runHandler, type HarnessUser } from './lib/seedControllerHarness';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const SEED_NOTE = 'seed-wallet-sept-';
const ORDER_COUNT = 30;
const SEPT_MONTH = 9;
const WALK_IN_PHONE = '0771000301';
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

type DayScenario =
  | 'delivered'
  | 'delivered-promo'
  | 'ref-rejected'
  | 'ref-late-complete'
  | 'ref-branch-complete'
  | 'ref-pending-branch'
  | 'ref-pending-customer';

function assertAllowed(): void {
  assertDevSeedOnly();
  if (process.env.ALLOW_WALLET_TESTING_SEPT_SEED !== 'true') {
    throw new Error('Set ALLOW_WALLET_TESTING_SEPT_SEED=true to run wallet testing September seed');
  }
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let year = 2026;
  let storeName = process.env.SEED_TARGET_STORE_NAME?.trim() || 'Nugegoda';
  let storeId = process.env.SEED_TARGET_STORE_ID?.trim() || undefined;
  const clean = argv.includes('--clean');
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg.startsWith('--year=')) year = Number(arg.split('=')[1]) || year;
    if (arg.startsWith('--store-name=')) storeName = arg.split('=')[1]?.trim() || storeName;
    if (arg.startsWith('--store-id=')) storeId = arg.split('=')[1]?.trim() || storeId;
    if (arg === '--store-id' && next) {
      storeId = next.trim();
      i += 1;
    }
  }
  return { year, storeName, storeId, clean };
}

function placedInColombo(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');
  return new Date(`${year}-${mm}-${dd}T${hh}:${min}:00+05:30`);
}

function scenarioForDay(day: number): DayScenario {
  if (day === 5 || day === 19) return 'ref-rejected';
  if (day === 7 || day === 23 || day === 29) return 'ref-late-complete';
  if (day === 11 || day === 27) return 'ref-branch-complete';
  if (day === 13) return 'ref-pending-branch';
  if (day === 17 || day === 30) return 'ref-pending-customer';
  if (day % 3 === 0) return 'delivered-promo';
  return 'delivered';
}

function seedOrderWhere(storeId: string) {
  return {
    storeId,
    notes: { startsWith: SEED_NOTE },
  };
}

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

async function deleteSeedOrderRows(orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return;

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

  await prisma.walletTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.promotionUsage.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
}

async function clearSeedOrders(storeId: string): Promise<number> {
  const seedOrders = await prisma.order.findMany({
    where: seedOrderWhere(storeId),
    select: { id: true },
  });
  if (seedOrders.length === 0) return 0;
  await deleteSeedOrderRows(seedOrders.map((o) => o.id));
  return seedOrders.length;
}

/** Remove wallet-sept seed orders at any branch (e.g. before reseeding another store). */
async function clearAllSeedOrders(): Promise<{ count: number; storeIds: string[] }> {
  const seedOrders = await prisma.order.findMany({
    where: { notes: { startsWith: SEED_NOTE } },
    select: { id: true, storeId: true },
  });
  if (seedOrders.length === 0) return { count: 0, storeIds: [] };
  const storeIds = [...new Set(seedOrders.map((o) => o.storeId))];
  await deleteSeedOrderRows(seedOrders.map((o) => o.id));
  return { count: seedOrders.length, storeIds };
}

async function resolveStore(nameNeedle: string, storeId?: string): Promise<StoreRow> {
  const store = storeId
    ? await prisma.store.findUnique({ where: { id: storeId }, select: storeSelect })
    : await prisma.store.findFirst({
        where: { name: { contains: nameNeedle }, isActive: true },
        select: storeSelect,
      });
  if (!store) {
    throw new Error(
      storeId ? `Store not found: ${storeId}` : `No active store matching "${nameNeedle}"`,
    );
  }
  if (!store.isActive) throw new Error(`Store ${store.name} (${store.id}) is not active`);
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

async function ensureBranchStaff(store: StoreRow): Promise<{
  managerId: string;
  branchStaffId: string;
  branchRole: 'CASHIER' | 'STORE_MANAGER';
}> {
  let manager = await prisma.adminUser.findFirst({
    where: { storeId: store.id, isActive: true, role: { name: 'STORE_MANAGER' } },
    select: { id: true },
  });
  let cashier = await prisma.adminUser.findFirst({
    where: { storeId: store.id, isActive: true, role: { name: 'CASHIER' } },
    select: { id: true },
  });

  if (!manager) {
    const [roleManager, roleCashier] = await Promise.all([
      prisma.role.findFirst({ where: { name: 'STORE_MANAGER' }, select: { id: true } }),
      prisma.role.findFirst({ where: { name: 'CASHIER' }, select: { id: true } }),
    ]);
    if (!roleManager || !roleCashier) {
      throw new Error('STORE_MANAGER or CASHIER role missing — run prisma seed');
    }
    const slug = branchSlugFromName(store.name);
    const branchHash = await bcrypt.hash('Branch@123', 10);
    const mgrEmail = `seed.wallet.mgr.${slug}@bingchun-test.lk`;
    manager = await prisma.adminUser.upsert({
      where: { email: mgrEmail },
      update: {
        storeId: store.id,
        roleId: roleManager.id,
        isActive: true,
        passwordHash: branchHash,
      },
      create: {
        name: `${store.name} Seed Manager`,
        email: mgrEmail,
        passwordHash: branchHash,
        roleId: roleManager.id,
        storeId: store.id,
      },
      select: { id: true },
    });
    console.log(`  created seed STORE_MANAGER for ${store.name} (${mgrEmail})`);
  }

  if (!cashier) {
    const roleCashier = await prisma.role.findFirst({ where: { name: 'CASHIER' }, select: { id: true } });
    if (!roleCashier) throw new Error('CASHIER role missing — run prisma seed');
    const slug = branchSlugFromName(store.name);
    const cashierHash = await bcrypt.hash('Cashier@123', 10);
    const cashEmail = `seed.wallet.cash.${slug}@bingchun-test.lk`;
    cashier = await prisma.adminUser.upsert({
      where: { email: cashEmail },
      update: {
        storeId: store.id,
        roleId: roleCashier.id,
        isActive: true,
        passwordHash: cashierHash,
      },
      create: {
        name: `${store.name} Seed Cashier`,
        email: cashEmail,
        passwordHash: cashierHash,
        roleId: roleCashier.id,
        storeId: store.id,
      },
      select: { id: true },
    });
    console.log(`  created seed CASHIER for ${store.name} (${cashEmail})`);
  }

  return {
    managerId: manager.id,
    branchStaffId: cashier.id,
    branchRole: 'CASHIER',
  };
}

async function ensureActors(store: StoreRow): Promise<Actors> {
  const seedPhone = normalizePhone(WALK_IN_PHONE);
  const passwordHash = await bcrypt.hash('Customer@123', 10);
  const email = 'seed.wallet.sept@bingchun-test.lk';
  let user = await prisma.user.findFirst({ where: { OR: [{ phone: seedPhone }, { email }] } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Wallet Sept Seed Customer',
        phone: seedPhone,
        email,
        passwordHash,
        isPhoneVerified: true,
      },
    });
  }

  const lat = store.lat + 0.002;
  const lng = store.lng + 0.0015;
  const addressLine = `22 Wallet Test Lane, ${store.city}`;
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

  const staff = await ensureBranchStaff(store);

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
      minOrderValue: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
  return promos
    .filter((p) => isPromoAvailableAtStore(p.storeIds, storeId))
    .filter((p) => !isSpinLinkedPromo(p))
    .filter((p) => !isLoyaltyPromoCode(p.code))
    .filter((p) => !/^SW/i.test(p.code))
    .filter((p) => (p.promotionKind || '').toUpperCase() !== 'SPIN_WHEEL')
    .filter((p) => p.maxUses == null || p.usedCount < p.maxUses)
    .sort((a, b) => (a.minOrderValue ?? 0) - (b.minOrderValue ?? 0))
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
  await syncStoreProducts(store.id, { stock: 0, isAvailable: false });
  await prisma.storeProduct.updateMany({
    where: { storeId: store.id, weeklyTargetQty: { lt: WEEKLY_TARGET_QTY } },
    data: { weeklyTargetQty: WEEKLY_TARGET_QTY },
  });

  const products = await prisma.storeProduct.findMany({
    where: { storeId: store.id },
    select: { productId: true },
  });
  if (products.length === 0) throw new Error(`No catalog rows linked at ${store.name} — check products table`);

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

async function placeOnlineDeliveryOrder(input: {
  store: StoreRow;
  actors: Actors;
  product: ProductPick;
  quantity: number;
  note: string;
  promoCode?: string;
}): Promise<{ id: string; orderNumber: string; total: number; orderMode: OrderMode; storeId: string }> {
  const { store, actors, product, quantity, note, promoCode } = input;
  const items = [{ productId: product.productId, size: 'REGULAR' as const, toppingIds: [] as string[], quantity }];

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
    items,
    paymentMethod: 'PAYHERE' satisfies PaymentMethod,
    channel: 'APP',
    notes: note,
    platform: 0,
    skipLoyaltyAutoApply: true,
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
  if (promoCode) body.promoCode = promoCode;

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
    select: { total: true, userId: true, paymentMethod: true, orderMode: true },
  });

  const paymentRef = `${SEED_NOTE}pay-${crypto.randomUUID()}`;
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
    { paymentRef },
  );

  const paid = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { id: true, orderNumber: true, total: true, orderMode: true, storeId: true },
  });
  return paid;
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
  target: OrderStatus,
  staff: HarnessUser & { type: 'admin' },
): Promise<void> {
  const flow: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
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
): Promise<void> {
  const body: Record<string, unknown> = { status };
  if (status === 'REJECTED') {
    body.adminNotes = 'Wallet sept seed: customer cancelled within window — refund rejected per policy test';
  }
  await runHandler(updateRefundStatus, {
    method: 'PUT',
    params: { id: refundId },
    user: manager,
    body,
  });
}

async function customerCancel(orderId: string, customer: HarnessUser & { type: 'user' }, reason: string): Promise<void> {
  await runHandler(cancelOrderByCustomer, {
    method: 'POST',
    params: { id: orderId },
    user: customer,
    body: { cancellationReason: reason },
  });
}

async function refundIdForOrder(orderId: string): Promise<string> {
  const refund = await prisma.refund.findUnique({ where: { orderId }, select: { id: true } });
  if (!refund) throw new Error(`Expected refund for order ${orderId}`);
  return refund.id;
}

async function expireCancelWindow(orderId: string): Promise<void> {
  const past = new Date(Date.now() - CUSTOMER_CANCEL_WINDOW_MS - 5 * 60 * 1000);
  await prisma.order.update({
    where: { id: orderId },
    data: { cancelWindowStartsAt: past },
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
    select: { id: true, createdAt: true, updatedAt: true, processedAt: true, paidAt: true },
  });
  if (refund) {
    await prisma.refund.update({
      where: { id: refund.id },
      data: {
        createdAt: new Date(refund.createdAt.getTime() + delta),
        updatedAt: new Date(refund.updatedAt.getTime() + delta),
        processedAt: refund.processedAt ? new Date(refund.processedAt.getTime() + delta) : null,
        paidAt: refund.paidAt ? new Date(refund.paidAt.getTime() + delta) : null,
      },
    });
  }

  const txs = await prisma.walletTransaction.findMany({ where: { orderId }, select: { id: true, createdAt: true } });
  for (const tx of txs) {
    await prisma.walletTransaction.update({
      where: { id: tx.id },
      data: { createdAt: new Date(tx.createdAt.getTime() + delta) },
    });
  }

  const promoUsage = await prisma.promotionUsage.findMany({ where: { orderId }, select: { id: true, createdAt: true } });
  for (const pu of promoUsage) {
    await prisma.promotionUsage.update({
      where: { id: pu.id },
      data: { createdAt: new Date(pu.createdAt.getTime() + delta) },
    });
  }
}

async function runDayScenario(input: {
  day: number;
  year: number;
  store: StoreRow;
  actors: Actors;
  products: ProductPick[];
  promos: string[];
  cancelReason: string;
  promoIdx: { n: number };
}): Promise<void> {
  const { day, year, store, actors, products, promos, cancelReason, promoIdx } = input;
  const scenario = scenarioForDay(day);
  const placedAt = placedInColombo(year, SEPT_MONTH, day, 9 + (day % 9), (day * 11) % 60);
  const product =
    scenario === 'delivered-promo' ? products[0] : products[(day - 1) % products.length];
  const quantity = (() => {
    let qty = scenario === 'delivered-promo' ? 2 + (day % 2) : 1 + (day % 3);
    const minSubtotal = scenario === 'delivered-promo' ? 900 : 550;
    while (qty * Math.max(product.basePrice, 1) < minSubtotal && qty < 12) qty += 1;
    return qty;
  })();
  const note = `${SEED_NOTE}${year}-09-${String(day).padStart(2, '0')}-${scenario}`;

  let promoCode: string | undefined;
  if (scenario === 'delivered-promo' && promos.length > 0) {
    promoCode = promos[promoIdx.n % promos.length];
    promoIdx.n += 1;
  }

  let order;
  let promoApplied = promoCode;
  try {
    order = await placeOnlineDeliveryOrder({ store, actors, product, quantity, note, promoCode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (promoCode) {
      promoApplied = undefined;
      try {
        order = await placeOnlineDeliveryOrder({ store, actors, product, quantity, note });
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (retryMsg.includes('Insufficient stock')) {
          await restockStore(store);
          order = await placeOnlineDeliveryOrder({ store, actors, product, quantity, note });
        } else {
          throw retryErr;
        }
      }
    } else if (msg.includes('Insufficient stock')) {
      await restockStore(store);
      order = await placeOnlineDeliveryOrder({ store, actors, product, quantity, note, promoCode });
    } else {
      throw err;
    }
  }
  if (!promoApplied && scenario === 'delivered-promo') {
    console.warn(`    (day ${day}: promo could not be applied — order placed without code)`);
  }

  switch (scenario) {
    case 'delivered':
    case 'delivered-promo':
      await advanceTo(order.id, 'DELIVERED', actors.branchStaff);
      break;
    case 'ref-rejected':
      await customerCancel(order.id, actors.customer, cancelReason);
      await completeRefund(await refundIdForOrder(order.id), actors.storeManager, 'REJECTED');
      break;
    case 'ref-late-complete':
      await advanceTo(order.id, 'PREPARING', actors.branchStaff);
      await expireCancelWindow(order.id);
      await customerCancel(order.id, actors.customer, cancelReason);
      await completeRefund(await refundIdForOrder(order.id), actors.storeManager, 'COMPLETE');
      break;
    case 'ref-branch-complete':
      await advanceTo(order.id, 'PREPARING', actors.branchStaff);
      await setStatus(order.id, 'CANCELLED', actors.branchStaff, {
        cancelReason: 'OUT_OF_STOCK',
        note: 'Branch cancel — wallet sept seed',
      });
      await completeRefund(await refundIdForOrder(order.id), actors.storeManager, 'COMPLETE');
      break;
    case 'ref-pending-branch':
      await advanceTo(order.id, 'READY', actors.branchStaff);
      await setStatus(order.id, 'CANCELLED', actors.branchStaff, {
        cancelReason: 'PAYMENT_OR_SYSTEM_ISSUE',
        note: 'Pending branch refund — wallet sept seed',
      });
      break;
    case 'ref-pending-customer':
      await advanceTo(order.id, 'PREPARING', actors.branchStaff);
      await expireCancelWindow(order.id);
      await customerCancel(order.id, actors.customer, cancelReason);
      break;
    default:
      break;
  }

  await shiftTimelines(order.id, placedAt);

  const snapshot = await prisma.order.findUnique({
    where: { id: order.id },
    select: {
      orderNumber: true,
      status: true,
      paymentStatus: true,
      total: true,
      discount: true,
      convenientFee: true,
      refund: { select: { status: true, refundAmount: true } },
    },
  });
  const promoUsed = await prisma.promotionUsage.count({ where: { orderId: order.id } });
  console.log(
    `  day ${String(day).padStart(2, '0')}  ${scenario.padEnd(20)}  ${snapshot?.orderNumber}  ` +
      `${snapshot?.status}  PAID→${snapshot?.paymentStatus}  LKR ${snapshot?.total}  ` +
      `disc ${snapshot?.discount ?? 0}  conv ${snapshot?.convenientFee ?? 0}  ` +
      `promo=${promoUsed > 0 ? 'yes' : 'no'}  ` +
      (snapshot?.refund ? `refund ${snapshot.refund.status} (${snapshot.refund.refundAmount})` : ''),
  );
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
  assertAllowed();
  patchPrismaTransactionTimeout();
  const { year, storeName, storeId, clean } = parseArgs();

  const store = await resolveStore(storeName, storeId);
  console.log(`Store: ${store.name} (${store.id})`);
  console.log(`Period: ${year}-09-01 … ${year}-09-30 (${ORDER_COUNT} paid DELIVERY orders)\n`);

  if (clean) {
    const { count, storeIds } = await clearAllSeedOrders();
    console.log(`Cleaned ${count} prior ${SEED_NOTE} order(s) across branch(es).\n`);
    for (const sid of storeIds) {
      await recalculateWalletBalance(sid);
    }
  }

  const existing = await prisma.order.count({ where: seedOrderWhere(store.id) });
  if (existing >= ORDER_COUNT && !clean) {
    console.log(`Already ${existing} seed orders — use --clean to replace.`);
    return;
  }
  if (existing > 0 && !clean) {
    await clearSeedOrders(store.id);
  }

  await restockStore(store);
  const actors = await ensureActors(store);
  const products = await loadProducts(store.id);
  if (products.length === 0) throw new Error('No products with stock');
  const promos = await loadPromoCodes(store.id);
  console.log(`Products: ${products.length}, active promos at store: ${promos.length}\n`);

  const cancelReasons = await getActiveCancelReasons();
  const cancelReason =
    cancelReasons.find((r) => r.value === 'CHANGED_MIND')?.value ?? cancelReasons[0]?.value ?? 'CHANGED_MIND';

  const promoIdx = { n: 0 };
  for (let day = 1; day <= ORDER_COUNT; day += 1) {
    await runDayScenario({ day, year, store, actors, products, promos, cancelReason, promoIdx });
  }

  await recalculateWalletBalance(store.id);

  const summary = await prisma.order.groupBy({
    by: ['status'],
    where: seedOrderWhere(store.id),
    _count: true,
  });
  const refundSummary = await prisma.refund.groupBy({
    by: ['status'],
    where: { order: seedOrderWhere(store.id) },
    _count: true,
  });
  const promoCount = await prisma.promotionUsage.count({
    where: { order: seedOrderWhere(store.id) },
  });

  console.log('\n--- Summary ---');
  console.log('Order statuses:', summary.map((s) => `${s.status}=${s._count}`).join(', '));
  console.log('Refund statuses:', refundSummary.map((s) => `${s.status}=${s._count}`).join(', ') || 'none');
  console.log(`Promotion usages: ${promoCount}`);
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
