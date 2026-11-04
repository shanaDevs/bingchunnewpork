/**
 * One PAID online DELIVERY order at Nugegoda with a completed customer refund,
 * backdated to 2 September (Colombo).
 *
 * Flow (same as wallet-testing `ref-late-complete`):
 *   place + PayHere → PREPARING → cancel window expired → customer cancel → manager COMPLETE refund
 *
 *   npm run seed:nuge-sept2-delivery-refund -w @bingchun/backend
 *   npm run seed:nuge-sept2-delivery-refund -w @bingchun/backend -- --year=2026 --clean
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
import { updatePaymentSettings } from '../lib/paymentSettings';
import { prisma } from '../lib/prisma';
import { syncStoreProducts } from '../lib/storeInventory';
import { recalculateWalletBalance } from '../lib/walletSync';
import { normalizePhone } from '../utils/phone';
import { runHandler, type HarnessUser } from './lib/seedControllerHarness';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const SEED_NOTE = 'seed-nuge-sept2-delivery-refund-';
const SEPT_DAY = 2;
const SEPT_MONTH = 9;
const WALK_IN_PHONE = '0771000403';
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
  if (!store) throw new Error('Bing Chun - Nugegoda not found — run prisma:seed first');
  if (!store.deliveryEnabled) {
    await prisma.store.update({ where: { id: store.id }, data: { deliveryEnabled: true } });
    store.deliveryEnabled = true;
  }
  return store;
}

async function resolveStaff(store: StoreRow): Promise<{
  managerId: string;
  branchStaffId: string;
  branchRole: 'CASHIER' | 'STORE_MANAGER';
}> {
  const manager =
    (await prisma.adminUser.findFirst({
      where: { email: 'branch@bingchunsrilanka.lk', isActive: true },
      select: { id: true, storeId: true },
    })) ??
    (await prisma.adminUser.findFirst({
      where: { storeId: store.id, isActive: true, role: { name: 'STORE_MANAGER' } },
      select: { id: true, storeId: true },
    }));
  const cashier =
    (await prisma.adminUser.findFirst({
      where: { email: 'cashier@bingchunsrilanka.lk', isActive: true },
      select: { id: true },
    })) ??
    (await prisma.adminUser.findFirst({
      where: { storeId: store.id, isActive: true, role: { name: 'CASHIER' } },
      select: { id: true },
    }));
  if (!manager) throw new Error('No STORE_MANAGER for Nugegoda — run prisma:seed');
  if (!cashier) throw new Error('No CASHIER for Nugegoda — run prisma:seed');
  return { managerId: manager.id, branchStaffId: cashier.id, branchRole: 'CASHIER' };
}

async function ensureActors(store: StoreRow): Promise<Actors> {
  const seedPhone = normalizePhone(WALK_IN_PHONE);
  const email = 'seed.nuge.sept2.refund@bingchun-test.lk';
  let user = await prisma.user.findFirst({ where: { OR: [{ phone: seedPhone }, { email }] } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Sept 2 Delivery Refund Seed',
        phone: seedPhone,
        email,
        passwordHash: await bcrypt.hash('Customer@123', 10),
        isPhoneVerified: true,
      },
    });
  }

  const addressLine = `61 Station Road, ${store.city}`;
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

  const staff = await resolveStaff(store);

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
  const dateKey = batchDateKey();
  const groupNumber = `R-${code}-${dateKey}-001`;
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
  console.log(`  restocked ${missing.length} product(s)`);
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

function deliveryItemQuantity(basePrice: number): number {
  const minSubtotal = 500;
  return Math.max(2, Math.ceil(minSubtotal / Math.max(basePrice, 1)));
}

async function placePaidDeliveryOrder(
  store: StoreRow,
  actors: Actors,
  product: ProductPick,
  quantity: number,
  note: string,
): Promise<{ id: string; orderNumber: string; total: number; storeId: string }> {
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
    select: { total: true, userId: true, paymentMethod: true, orderMode: true },
  });

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

  return prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { id: true, orderNumber: true, total: true, storeId: true },
  });
}

async function setStatus(
  orderId: string,
  status: OrderStatus,
  staff: HarnessUser & { type: 'admin' },
  extra?: { note?: string },
): Promise<void> {
  await runHandler(updateOrderStatus, {
    method: 'PUT',
    params: { id: orderId },
    user: staff,
    body: { status, note: extra?.note },
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

async function customerCancel(
  orderId: string,
  customer: HarnessUser & { type: 'user' },
  reason: string,
): Promise<void> {
  await runHandler(cancelOrderByCustomer, {
    method: 'POST',
    params: { id: orderId },
    user: customer,
    body: { cancellationReason: reason },
  });
}

async function completeRefund(
  refundId: string,
  manager: HarnessUser & { type: 'admin' },
): Promise<void> {
  await runHandler(updateRefundStatus, {
    method: 'PUT',
    params: { id: refundId },
    user: manager,
    body: { status: 'COMPLETE' },
  });
}

async function refundIdForOrder(orderId: string): Promise<string> {
  const refund = await prisma.refund.findUnique({ where: { orderId }, select: { id: true } });
  if (!refund) throw new Error(`Expected refund row for order ${orderId}`);
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
  await prisma.walletTransaction.deleteMany({ where: { orderId } });
  await prisma.refund.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
}

async function main() {
  assertDevSeedOnly();
  patchPrismaTransactionTimeout();
  const { year, clean } = parseArgs();
  const note = `${SEED_NOTE}${year}-09-02-late-refund`;
  const placedAt = placedInColombo(year, SEPT_MONTH, SEPT_DAY, 14, 45);

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
      createdAt: true,
      total: true,
      refund: { select: { status: true, refundAmount: true } },
    },
  });

  if (existing && !clean) {
    console.log(
      `Already seeded: ${existing.orderNumber}  ${existing.status}  ${existing.paymentStatus}  ` +
        `refund=${existing.refund?.status ?? 'none'} (${existing.refund?.refundAmount ?? '—'})  ` +
        `created ${existing.createdAt.toISOString()}`,
    );
    console.log('Use --clean to replace.');
    return;
  }
  if (existing && clean) {
    await deleteSeedOrder(existing.id);
    console.log(`Removed prior ${existing.orderNumber}\n`);
  }

  const cancelReasons = await getActiveCancelReasons();
  const cancelReason =
    cancelReasons.find((r) => r.value === 'CHANGED_MIND')?.value ?? cancelReasons[0]?.value ?? 'CHANGED_MIND';

  await ensureOnlineCheckoutEnabled();
  await restockStore(store);
  const actors = await ensureActors(store);
  const product = await loadProduct(store.id);
  const quantity = deliveryItemQuantity(product.basePrice);
  console.log(`Product: ${product.name} (x${quantity})\n`);

  const order = await placePaidDeliveryOrder(store, actors, product, quantity, note);

  await advanceTo(order.id, 'PREPARING', actors.branchStaff);
  await expireCancelWindow(order.id);
  await customerCancel(order.id, actors.customer, cancelReason);
  await completeRefund(await refundIdForOrder(order.id), actors.storeManager);

  await shiftTimelines(order.id, placedAt);
  await recalculateWalletBalance(store.id);

  const snapshot = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: {
      refund: {
        select: {
          id: true,
          status: true,
          refundAmount: true,
          submittedBy: true,
          cancelledAtStatus: true,
          processedAt: true,
        },
      },
    },
  });

  console.log('✅ Created paid online delivery order with completed refund');
  console.log(`   ${snapshot.orderNumber}  ${snapshot.orderMode}  ${snapshot.paymentMethod}`);
  console.log(`   ${snapshot.status} / ${snapshot.paymentStatus}  LKR ${snapshot.total}`);
  console.log(`   createdAt: ${snapshot.createdAt.toISOString()}`);
  if (snapshot.refund) {
    console.log(
      `   refund: ${snapshot.refund.status}  LKR ${snapshot.refund.refundAmount}  by ${snapshot.refund.submittedBy}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
