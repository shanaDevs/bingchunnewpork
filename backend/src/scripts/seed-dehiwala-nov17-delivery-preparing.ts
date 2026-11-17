/**
 * One PAID PayHere DELIVERY order at Dehiwala (17 Nov) — 50% sugar, less ice — left at PREPARING.
 *
 *   npm run seed:dehiwala-nov17-preparing -w @bingchun/backend
 *   npm run seed:dehiwala-nov17-preparing -w @bingchun/backend -- --year=2026 --clean
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
import { syncMissingWalletPayments, recalculateWalletBalance } from '../lib/walletSync';
import { normalizePhone } from '../utils/phone';
import { runHandler, type HarnessUser } from './lib/seedControllerHarness';
import { ensureAppSchema } from '../lib/appSchema';
import { assertDevSeedOnly } from './seedGuard';

dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const SEED_NOTE = 'seed-dehiwala-nov17-preparing-';
const ORDER_MONTH = 11;
const ORDER_DAY = 17;
const WALK_IN_PHONE = '0771001117';
const DEHIWALA_BRANCH_EMAIL = 'dehiwalabranch@gmail.com';
const DEHIWALA_BRANCH_PASSWORD = 'Branch@123';
const MIN_DELIVERY_SUBTOTAL = 550;
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

async function ensureOnlineCheckout(): Promise<void> {
  await updatePaymentSettings({
    activeOnlineGateway: 'PAYHERE',
    payhereMode: 'sandbox',
    payhereMerchantId: '1225599',
    payhereMerchantSecret: 'sandboxsecretkey123',
    paymentMethods: {
      PAYHERE: { enabled: true, label: 'Online Payment', modes: ['DELIVERY', 'TAKEAWAY'] },
      CARD: { enabled: false, label: 'Online Payment', modes: ['DELIVERY', 'TAKEAWAY'] },
      CASH_AT_COUNTER: { enabled: false, label: 'Cash at Counter', modes: ['TAKEAWAY'] },
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
  if (!store) throw new Error('Bing Chun - Dehiwala not found');
  if (!store.deliveryEnabled) {
    await prisma.store.update({ where: { id: store.id }, data: { deliveryEnabled: true } });
    store.deliveryEnabled = true;
  }
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
  const email = 'seed.dehiwala.nov17.preparing@bingchun-test.lk';
  let user = await prisma.user.findFirst({ where: { OR: [{ phone: seedPhone }, { email }] } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Dehiwala Nov17 Preparing Seed',
        phone: seedPhone,
        email,
        passwordHash: await bcrypt.hash('Customer@123', 10),
        isPhoneVerified: true,
      },
    });
  }

  const addressLine = `22 Nov17 Preparing Lane, ${store.city}`;
  let address = await prisma.address.findFirst({ where: { userId: user.id, addressLine } });
  if (!address) {
    address = await prisma.address.create({
      data: {
        userId: user.id,
        label: 'Home',
        addressLine,
        city: store.city,
        district: store.district,
        lat: store.lat + 0.003,
        lng: store.lng + 0.002,
        isDefault: true,
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
    customerId: user.id,
    addressId: address.id,
    customer: { sub: user.id, type: 'user' },
    branchStaff,
  };
}

async function restockMinimal(storeId: string): Promise<void> {
  await syncStoreProducts(storeId, { stock: 50, isAvailable: true });
}

async function pickDeliveryProduct(storeId: string) {
  const rows = await prisma.storeProduct.findMany({
    where: { storeId, isAvailable: true, stock: { gt: 0 } },
    include: { product: { select: { id: true, name: true, basePrice: true, isAvailable: true, category: true } } },
  });
  const drink =
    rows.find((r) => r.product.isAvailable && r.product.name.toLowerCase().includes('milk tea')) ??
    rows.find((r) => r.product.isAvailable && r.product.basePrice >= MIN_DELIVERY_SUBTOTAL) ??
    rows.find((r) => r.product.isAvailable);
  if (!drink) throw new Error('No product for delivery');
  const qty = Math.max(1, Math.ceil(MIN_DELIVERY_SUBTOTAL / Math.max(drink.product.basePrice, 1)));
  return { productId: drink.product.id, name: drink.product.name, basePrice: drink.product.basePrice, qty };
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

async function advanceToPreparing(orderId: string, staff: HarnessUser & { type: 'admin' }): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  if (order.status === 'RECEIVED') {
    await setStatus(orderId, 'PREPARING', staff, `${SEED_NOTE}advance-PREPARING`);
    return;
  }
  if (order.status !== 'PREPARING') {
    throw new Error(`Expected RECEIVED before PREPARING, got ${order.status}`);
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
}

async function deleteSeedOrder(orderId: string): Promise<void> {
  await prisma.promotionUsage.deleteMany({ where: { orderId } });
  await prisma.walletTransaction.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
}

async function main() {
  assertDevSeedOnly();
  process.env.RUNTIME_SCHEMA_PATCHES = 'true';
  await ensureAppSchema();

  const { year, clean } = parseArgs();
  const note = `${SEED_NOTE}${year}-11-17`;
  const placedAt = placedInColombo(year, ORDER_MONTH, ORDER_DAY, 14, 20);

  const store = await resolveDehiwala();
  console.log(`Store: ${store.name}`);
  console.log(`Target: ${year}-11-17 DELIVERY PayHere PAID → PREPARING (50% sugar, less ice)\n`);

  const existing = await prisma.order.findFirst({
    where: { storeId: store.id, notes: note },
    select: { id: true, orderNumber: true, status: true, paymentStatus: true },
  });
  if (existing && !clean) {
    console.log(`Already seeded: ${existing.orderNumber}  ${existing.status}/${existing.paymentStatus}`);
    console.log('Use --clean to replace.');
    return;
  }
  if (existing && clean) {
    await deleteSeedOrder(existing.id);
    console.log(`Removed prior ${existing.orderNumber}\n`);
  }

  await prisma.store.update({
    where: { id: store.id },
    data: { onlineOrderStartTime: '00:00', onlineOrderStopTime: '23:59' },
  });

  await ensureOnlineCheckout();
  await restockMinimal(store.id);
  const actors = await ensureActors(store);
  const product = await pickDeliveryProduct(store.id);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actors.customerId } });
  const addr = await prisma.address.findUniqueOrThrow({ where: { id: actors.addressId } });

  const body: Record<string, unknown> = {
    orderMode: 'DELIVERY',
    storeId: store.id,
    items: [
      {
        productId: product.productId,
        size: 'REGULAR',
        toppingIds: [],
        quantity: product.qty,
        sugarLevel: 'FIFTY',
        iceLevel: 'LESS_ICE',
      },
    ],
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
    order: { id: string; orderNumber: string; storeId: string };
  }>(placeOrder, {
    body,
    user: actors.customer,
    headers: { 'idempotency-key': crypto.randomUUID() },
  });

  const orderId = data.order.id;
  const row = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderNumber: true,
      total: true,
      userId: true,
      paymentMethod: true,
      orderMode: true,
      paymentStatus: true,
      status: true,
    },
  });

  await markOnlineOrderPaid(
    {
      id: orderId,
      orderNumber: row.orderNumber,
      storeId: data.order.storeId,
      total: row.total,
      paymentMethod: row.paymentMethod,
      userId: row.userId,
      orderMode: row.orderMode as OrderMode,
    },
    { paymentRef: `${SEED_NOTE}pay-${crypto.randomUUID()}` },
  );

  await advanceToPreparing(orderId, actors.branchStaff);
  await shiftTimelines(orderId, placedAt);

  await syncMissingWalletPayments(store.id);
  await recalculateWalletBalance(store.id);

  const line = await prisma.orderItem.findFirst({
    where: { orderId },
    select: { productName: true, sugarLevel: true, iceLevel: true, quantity: true },
  });
  const final = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderNumber: true,
      status: true,
      paymentStatus: true,
      orderMode: true,
      paymentMethod: true,
      total: true,
      createdAt: true,
    },
  });

  console.log(
    `✅ ${final.orderNumber}  ${final.status}/${final.paymentStatus}  ${final.orderMode} ${final.paymentMethod}  ` +
      `LKR ${final.total}  ${final.createdAt.toISOString()}`,
  );
  console.log(
    `   Line: ${line?.productName} x${line?.quantity}  sugar=${line?.sugarLevel}  ice=${line?.iceLevel}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());