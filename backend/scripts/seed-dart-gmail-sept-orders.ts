/**
 * Fifteen DELIVERY orders for dart@gmail.com (dartcodes) at the DART CODES branch:
 * PAID online (PAYHERE), status READY, placed 1–15 September (Colombo time).
 *
 *   cd backend && npx tsx scripts/seed-dart-gmail-sept-orders.ts
 *   cd backend && npx tsx scripts/seed-dart-gmail-sept-orders.ts --clean
 */
import crypto from 'crypto';
import type { OrderStatus, PaymentMethod } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { assertDevSeedOnly } from '../src/scripts/seedGuard';
import { finalizeOrderAfterOnlinePayment } from '../src/lib/orderPlacement';
import { recalculateWalletBalance } from '../src/lib/walletSync';
import { centsToDecimal } from '../src/lib/moneyDecimal';
import { appliesConvenienceFee } from '../src/lib/orderPayment';
import { getPaymentSettings } from '../src/lib/paymentSettings';
import { normalizePhone } from '../src/utils/phone';

const SEED_NOTE = 'seed-dart-sept-';
const CUSTOMER_EMAIL = 'dart@gmail.com';
const CUSTOMER_NAME = 'dartcodes';
const CUSTOMER_PHONE = normalizePhone('0771000200');
const SEPT_YEAR = 2026;
const ORDER_COUNT = 15;
const DELIVERY_FEE = 200;
const DELIVERY_FEE_RATE = 0.065;

const PAYMENT_FINALIZED_NOTE = 'Payment confirmed — order sent to store';

const STOPS = [
  { label: 'Lunawa Station', addressLine: '12 Lunawa Station Road', city: 'Lunawa', district: 'Colombo' },
  { label: 'Rawathawatta', addressLine: '45 Rawathawatta Main Rd', city: 'Rawathawatta', district: 'Colombo' },
  { label: 'Moratuwa Rd', addressLine: '8 Moratuwa Road', city: 'Lunawa', district: 'Colombo' },
  { label: 'Station Rd', addressLine: '22 Station Road', city: 'Lunawa', district: 'Colombo' },
  { label: 'Galle Rd', addressLine: '101 Galle Road', city: 'Moratuwa', district: 'Colombo' },
  { label: 'Kohuwala', addressLine: '3 Kohuwala Junction', city: 'Kohuwala', district: 'Colombo' },
  { label: 'Nugegoda', addressLine: '55 High Level Road', city: 'Nugegoda', district: 'Colombo' },
  { label: 'Dehiwala', addressLine: '14 Dehiwala Road', city: 'Dehiwala', district: 'Colombo' },
  { label: 'Mount Lavinia', addressLine: '6 Station Road', city: 'Mount Lavinia', district: 'Colombo' },
  { label: 'Ratmalana', addressLine: '29 Galle Road', city: 'Ratmalana', district: 'Colombo' },
  { label: 'Piliyandala', addressLine: '17 Piliyandala Road', city: 'Piliyandala', district: 'Colombo' },
  { label: 'Kottawa', addressLine: '9 Kottawa Road', city: 'Kottawa', district: 'Colombo' },
  { label: 'Homagama', addressLine: '4 Homagama Road', city: 'Homagama', district: 'Colombo' },
  { label: 'Padukka Rd', addressLine: '33 Padukka Road', city: 'Homagama', district: 'Colombo' },
  { label: 'Bandaragama', addressLine: '2 Bandaragama Road', city: 'Bandaragama', district: 'Kalutara' },
] as const;

function colomboDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');
  return new Date(`${year}-${mm}-${dd}T${hh}:${min}:00+05:30`);
}

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

function orderNumberFor(placedAt: Date, seq: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(placedAt);
  const num = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const yy = num('year').slice(-2);
  const mm = num('month');
  const dd = num('day');
  return `BC${yy}${mm}${dd}-${String(1000 + seq).slice(-4)}`;
}

function convenientFee(subtotal: number): number {
  if (!appliesConvenienceFee('DELIVERY', 'PAYHERE')) return 0;
  return Math.round(subtotal * DELIVERY_FEE_RATE);
}

function buildStatusEvents(placedAt: Date): Array<{ status: OrderStatus; note: string; createdAt: Date }> {
  return [
    { status: 'RECEIVED', note: 'Order placed — received', createdAt: placedAt },
    {
      status: 'RECEIVED',
      note: PAYMENT_FINALIZED_NOTE,
      createdAt: addMinutes(placedAt, 2),
    },
    {
      status: 'PREPARING',
      note: 'Branch accepted and started preparing',
      createdAt: addMinutes(placedAt, 8),
    },
    {
      status: 'READY',
      note: 'Ready for rider',
      createdAt: addMinutes(placedAt, 22),
    },
  ];
}

async function ensureCustomer() {
  let user = await prisma.user.findFirst({
    where: { email: { equals: CUSTOMER_EMAIL, mode: 'insensitive' } },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: CUSTOMER_NAME,
        email: CUSTOMER_EMAIL.toLowerCase(),
        phone: CUSTOMER_PHONE,
        isPhoneVerified: true,
      },
    });
    console.log('Created customer', user.id, user.email);
    return user;
  }
  const updates: { name?: string; phone?: string } = {};
  if (user.name !== CUSTOMER_NAME) updates.name = CUSTOMER_NAME;
  if (!user.phone) updates.phone = CUSTOMER_PHONE;
  if (Object.keys(updates).length > 0) {
    user = await prisma.user.update({ where: { id: user.id }, data: updates });
  }
  console.log('Using customer', user.id, user.name, user.email, user.phone);
  return user;
}

/** Ledger row shape required by DB migrations not yet on the Prisma model. */
async function creditWalletForPaidOrder(order: {
  id: string;
  storeId: string;
  orderNumber: string;
  total: number;
  paymentMethod: string;
  paymentRef: string | null;
  paymentGateway: string | null;
  placedAt: Date;
}): Promise<void> {
  const cents = order.total * 100;
  const idempotencyKey = `ORDER_PAYMENT:${order.id}`;
  const description = `Order #${order.orderNumber} · (DELIVERY) · Ref: ${order.paymentRef ?? 'n/a'}`;

  await prisma.$executeRaw`
    INSERT INTO wallet_transactions (
      id, "storeId", "orderId", type, direction, counterparty, "idempotencyKey",
      amount, "balanceAfter", "paymentMethod", "paymentRef", description, reference,
      "createdAt", "orderMode", "paymentGateway", "orderCreatedAt", "orderTotalCents",
      "fundsLocation", "commissionChannel"
    )
    VALUES (
      ${crypto.randomUUID()},
      ${order.storeId},
      ${order.id},
      'ORDER_PAYMENT'::"WalletTransactionType",
      'CREDIT'::"WalletTxDirection",
      'CUSTOMER'::"WalletTxCounterparty",
      ${idempotencyKey},
      ${centsToDecimal(cents)},
      ${centsToDecimal(0)},
      ${order.paymentMethod}::"PaymentMethod",
      ${order.paymentRef},
      ${description},
      ${order.orderNumber},
      ${order.placedAt},
      'DELIVERY'::"OrderMode",
      ${order.paymentGateway ?? 'PAYHERE'}::"PaymentGateway",
      ${order.placedAt},
      ${centsToDecimal(cents)},
      'ONLINE_WALLET'::"WalletFundsLocation",
      'DELIVERY_ONLINE'::"WalletCommissionChannel"
    )
    ON CONFLICT ("idempotencyKey") DO NOTHING
  `;
}

async function cleanExisting(storeId: string): Promise<number> {
  const existing = await prisma.order.findMany({
    where: { storeId, notes: { startsWith: SEED_NOTE } },
    select: { id: true },
  });
  if (existing.length === 0) return 0;
  const ids = existing.map((o) => o.id);

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
  await prisma.loyaltyTransaction.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

async function main() {
  assertDevSeedOnly();
  const doClean = process.argv.includes('--clean');

  const store = await prisma.store.findFirst({
    where: { code: 'DARTCO', isActive: true },
    select: {
      id: true,
      name: true,
      lat: true,
      lng: true,
      deliveryEnabled: true,
      city: true,
      district: true,
    },
  });
  if (!store) throw new Error('DART CODES branch (code DARTCO) not found');

  if (!store.deliveryEnabled) {
    await prisma.store.update({ where: { id: store.id }, data: { deliveryEnabled: true } });
  }

  if (doClean) {
    const n = await cleanExisting(store.id);
    console.log(`Cleaned ${n} existing ${SEED_NOTE} order(s).`);
  }

  const existingCount = await prisma.order.count({
    where: { storeId: store.id, notes: { startsWith: SEED_NOTE } },
  });
  if (existingCount >= ORDER_COUNT) {
    const rows = await prisma.order.findMany({
      where: { storeId: store.id, notes: { startsWith: SEED_NOTE } },
      select: { orderNumber: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`Store: ${store.name}`);
    console.log(`Already have ${rows.length} seed orders (--clean to replace):`);
    for (const row of rows) {
      console.log(`  ${row.orderNumber}  ${row.status}  ${row.createdAt.toISOString()}`);
    }
    return;
  }

  const user = await ensureCustomer();
  const paymentSettings = await getPaymentSettings();
  const paymentGateway = paymentSettings.activeOnlineGateway;

  const storeProducts = await prisma.storeProduct.findMany({
    where: {
      storeId: store.id,
      stock: { gt: 0 },
      product: { isAvailable: true },
    },
    select: {
      productId: true,
      product: { select: { id: true, name: true, basePrice: true } },
    },
    orderBy: { product: { name: 'asc' } },
    take: ORDER_COUNT,
  });
  if (storeProducts.length === 0) {
    throw new Error(`No in-stock products at ${store.name}. Restock before seeding.`);
  }

  console.log(`Store: ${store.name} (${store.id})`);
  console.log(`Seeding ${ORDER_COUNT} orders for ${CUSTOMER_EMAIL}…\n`);

  for (let day = 1; day <= ORDER_COUNT; day++) {
    const stop = STOPS[day - 1];
    const placedAt = colomboDate(SEPT_YEAR, 9, day, 11 + (day % 6), 10 + day);
    const readyAt = addMinutes(placedAt, 22);
    const lat = store.lat + (day % 5) * 0.002 - 0.004;
    const lng = store.lng + (day % 7) * 0.0015 - 0.003;

    let address = await prisma.address.findFirst({
      where: { userId: user.id, addressLine: stop.addressLine },
    });
    if (!address) {
      address = await prisma.address.create({
        data: {
          userId: user.id,
          label: stop.label,
          addressLine: stop.addressLine,
          city: stop.city,
          district: stop.district,
          lat,
          lng,
          isDefault: day === 1,
        },
      });
    }

    const catalog = storeProducts[(day - 1) % storeProducts.length].product;
    const qty = 1 + (day % 2);
    const unit = catalog.basePrice || 550;
    const subtotal = unit * qty;
    const fee = convenientFee(subtotal);
    const total = subtotal + DELIVERY_FEE + fee;
    const orderNumber = orderNumberFor(placedAt, day);
    const paymentRef = `${SEED_NOTE}pay-${SEPT_YEAR}090${String(day).padStart(2, '0')}`;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        trackToken: crypto.randomBytes(16).toString('hex'),
        userId: user.id,
        guestName: CUSTOMER_NAME,
        guestPhone: user.phone ?? CUSTOMER_PHONE,
        guestEmail: CUSTOMER_EMAIL,
        storeId: store.id,
        addressId: address.id,
        orderMode: 'DELIVERY',
        channel: 'APP',
        status: 'READY',
        paymentMethod: 'PAYHERE' satisfies PaymentMethod,
        paymentGateway,
        paymentStatus: 'PAID',
        paymentRef,
        prepaidAmount: total,
        subtotal,
        deliveryFee: DELIVERY_FEE,
        convenientFee: fee,
        discount: 0,
        loyaltyDiscount: 0,
        total,
        estimatedMinutes: 35,
        notes: `${SEED_NOTE}${SEPT_YEAR}-09-${String(day).padStart(2, '0')}`,
        deliveryAddressLine: stop.addressLine,
        deliveryCity: stop.city,
        deliveryDistrict: stop.district,
        deliveryLat: lat,
        deliveryLng: lng,
        cancelWindowStartsAt: placedAt,
        createdAt: placedAt,
        updatedAt: readyAt,
        items: {
          create: [
            {
              productId: catalog.id,
              productName: catalog.name,
              size: 'REGULAR',
              quantity: qty,
              unitPrice: unit,
              totalPrice: subtotal,
            },
          ],
        },
        statusEvents: { create: buildStatusEvents(placedAt) },
      },
      select: { id: true, orderNumber: true, storeId: true, total: true, paymentMethod: true },
    });

    await creditWalletForPaidOrder({
      id: order.id,
      storeId: order.storeId,
      orderNumber: order.orderNumber,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentRef,
      paymentGateway,
      placedAt,
    });
    await finalizeOrderAfterOnlinePayment(order.id);

    console.log(
      `  ✔  ${order.orderNumber}  READY  PAID  ${placedAt.toISOString().slice(0, 10)}  LKR ${total}`,
    );
  }

  await recalculateWalletBalance(store.id);

  console.log(`\nDone — ${ORDER_COUNT} delivery orders at ${store.name} for ${CUSTOMER_EMAIL}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
