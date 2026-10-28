/**
 * Seeds delivery orders under the user Chamathka Prasad (phone: 0788677359).
 *
 * Orders have varied statuses, items, stores, payment methods and dates spread
 * across the past 14 days to simulate realistic activity.
 *
 * Usage:
 *   npm run seed:chamathka -w @bingchun/backend
 *   npm run seed:chamathka -w @bingchun/backend -- --clean
 *   npm run seed:chamathka -w @bingchun/backend -- --clean --limit 10
 *
 * Flags:
 *   --clean       Delete all existing seed-chamathka-* orders before re-seeding
 *   --limit N     Only seed the first N entries in ORDER_SPECS (default: all)
 */

import crypto from 'crypto';
import { assertDevSeedOnly } from './seedGuard';
assertDevSeedOnly();
import dotenv from 'dotenv';
import path from 'path';
import type {
  OrderChannel,
  OrderStatus,
  PaymentGateway,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { normalizePhone, phoneLookupVariants } from '../utils/phone';

dotenv.config({ path: path.join(__dirname, '../../.env') });

// ─── Constants ────────────────────────────────────────────────────────────────

const CUSTOMER_PHONE = '0788677359';
const SEED_PREFIX = 'seed-chamathka-';
const LOYALTY_OFFER2_CODE = 'LOYALTY-OFFER2';
const GIFT_PRODUCT_NAME = 'Vanilla Ice Cream';

// READY delivery jobs for Nugegoda (seq 1–10 existing + 11–15 extra + 16 gift + 17 clone of BC260909-4358)
const ORDER_SPECS: Array<{
  seq: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  deliveryFee: number;
  convenientFee: number;
  daysAgo: number;
  hour: number;
  itemCount: number;
  addressLine: string;
  city: string;
  district: string;
  notes?: string;
  includeLoyaltyGift?: boolean;
  productNames?: string[];
  lat?: number;
  lng?: number;
  channel?: OrderChannel;
  paymentGateway?: PaymentGateway;
}> = [
  // READY (all 10 orders waiting for driver pickup)
  {
    seq: 1,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 1850,
    deliveryFee: 250,
    convenientFee: 120,
    daysAgo: 13,
    hour: 12,
    itemCount: 2,
    addressLine: '45/A Nawala Road',
    city: 'Nugegoda',
    district: 'Colombo',
  },
  {
    seq: 2,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 1200,
    deliveryFee: 200,
    convenientFee: 0,
    daysAgo: 10,
    hour: 19,
    itemCount: 1,
    addressLine: '12 Galle Road',
    city: 'Colombo 03',
    district: 'Colombo',
  },
  {
    seq: 3,
    status: 'READY',
    paymentMethod: 'CARD',
    paymentStatus: 'PAID',
    subtotal: 2700,
    deliveryFee: 300,
    convenientFee: 175,
    daysAgo: 7,
    hour: 13,
    itemCount: 3,
    addressLine: '88 High Level Road',
    city: 'Maharagama',
    district: 'Colombo',
  },
  {
    seq: 4,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 1450,
    deliveryFee: 250,
    convenientFee: 94,
    daysAgo: 1,
    hour: 11,
    itemCount: 2,
    addressLine: '33 Duplication Road',
    city: 'Colombo 05',
    district: 'Colombo',
    notes: 'Please ring doorbell',
  },
  {
    seq: 5,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 980,
    deliveryFee: 200,
    convenientFee: 0,
    daysAgo: 0,
    hour: 18,
    itemCount: 1,
    addressLine: '7 Kotte Road',
    city: 'Sri Jayawardenepura',
    district: 'Colombo',
  },
  {
    seq: 6,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 1650,
    deliveryFee: 250,
    convenientFee: 107,
    daysAgo: 0,
    hour: 10,
    itemCount: 2,
    addressLine: '22 Baseline Road',
    city: 'Colombo 09',
    district: 'Colombo',
  },
  {
    seq: 7,
    status: 'READY',
    paymentMethod: 'CARD',
    paymentStatus: 'PAID',
    subtotal: 3100,
    deliveryFee: 350,
    convenientFee: 201,
    daysAgo: 0,
    hour: 14,
    itemCount: 3,
    addressLine: '5 Reid Avenue',
    city: 'Colombo 07',
    district: 'Colombo',
  },
  {
    seq: 8,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 890,
    deliveryFee: 150,
    convenientFee: 0,
    daysAgo: 0,
    hour: 20,
    itemCount: 1,
    addressLine: '14 Havelock Road',
    city: 'Colombo 05',
    district: 'Colombo',
    notes: 'Leave at gate',
  },
  {
    seq: 9,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 2200,
    deliveryFee: 300,
    convenientFee: 143,
    daysAgo: 0,
    hour: 21,
    itemCount: 2,
    addressLine: '9 Flower Road',
    city: 'Colombo 07',
    district: 'Colombo',
  },
  {
    seq: 10,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 1350,
    deliveryFee: 200,
    convenientFee: 88,
    daysAgo: 0,
    hour: 16,
    itemCount: 1,
    addressLine: '78 Nawala Road',
    city: 'Rajagiriya',
    district: 'Colombo',
  },
  // Extra 5 for today (Nugegoda / Chamathka Prasad)
  {
    seq: 11,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 1580,
    deliveryFee: 250,
    convenientFee: 103,
    daysAgo: 0,
    hour: 9,
    itemCount: 2,
    addressLine: '21 Ward Place',
    city: 'Colombo 07',
    district: 'Colombo',
  },
  {
    seq: 12,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 1120,
    deliveryFee: 200,
    convenientFee: 0,
    daysAgo: 0,
    hour: 11,
    itemCount: 1,
    addressLine: '56 Horton Place',
    city: 'Colombo 07',
    district: 'Colombo',
  },
  {
    seq: 13,
    status: 'READY',
    paymentMethod: 'CARD',
    paymentStatus: 'PAID',
    subtotal: 2450,
    deliveryFee: 300,
    convenientFee: 159,
    daysAgo: 0,
    hour: 13,
    itemCount: 3,
    addressLine: '4 Bauddhaloka Mawatha',
    city: 'Colombo 07',
    district: 'Colombo',
    notes: 'Call on arrival',
  },
  {
    seq: 14,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 1760,
    deliveryFee: 250,
    convenientFee: 114,
    daysAgo: 0,
    hour: 15,
    itemCount: 2,
    addressLine: '102 Independence Avenue',
    city: 'Colombo 07',
    district: 'Colombo',
  },
  {
    seq: 15,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 990,
    deliveryFee: 200,
    convenientFee: 0,
    daysAgo: 0,
    hour: 17,
    itemCount: 1,
    addressLine: '18 Gregory\'s Road',
    city: 'Colombo 07',
    district: 'Colombo',
  },
  // Second-order free ice cream (Offer 2) — unpacked so it can be classified into a ride
  {
    seq: 16,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 1450,
    deliveryFee: 250,
    convenientFee: 94,
    daysAgo: 0,
    hour: 12,
    itemCount: 1,
    addressLine: '31 Station Road',
    city: 'Lunawa',
    district: 'Colombo',
    notes: 'Spin gift: Free Vanilla Ice Cream',
    includeLoyaltyGift: true,
  },
  // Clone of BC260909-4358 (READY so it can be classified onto a ride)
  {
    seq: 17,
    status: 'READY',
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    subtotal: 1100,
    deliveryFee: 150,
    convenientFee: 83,
    daysAgo: 0,
    hour: 12,
    itemCount: 2,
    addressLine: 'Lunawa Station Rd, Rawathawatta, Western Province',
    city: 'Rawathawatta',
    district: 'Colombo',
    notes: 'Spin gift: Free Vanilla Ice Cream',
    includeLoyaltyGift: true,
    productNames: ['Chocolate Oreo Milkshake', 'Strawberry Lemon Tea'],
    lat: 6.787820609521503,
    lng: 79.87970395501297,
    channel: 'WEB',
    paymentGateway: 'WEBXPAY',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgoAt(daysAgo: number, hour: number): Date {
  const now = new Date();
  now.setDate(now.getDate() - daysAgo);
  now.setHours(hour, Math.floor(Math.random() * 55), 0, 0);
  return now;
}

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function makeOrderId(seq: number): string {
  return `${SEED_PREFIX}${String(seq).padStart(3, '0')}`;
}

function makeOrderNumber(seq: number): string {
  return `BCCHAM-${String(seq).padStart(3, '0')}`;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanExistingOrders(): Promise<number> {
  const existing = await prisma.order.findMany({
    where: { id: { startsWith: SEED_PREFIX } },
    select: { id: true },
  });
  if (existing.length === 0) return 0;
  const ids = existing.map((o) => o.id);
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

// ─── Build status event chain ─────────────────────────────────────────────────

function buildStatusEvents(
  status: OrderStatus,
  placedAt: Date,
): Array<{ status: OrderStatus; note: string; createdAt: Date }> {
  const events: Array<{ status: OrderStatus; note: string; createdAt: Date }> = [
    { status: 'RECEIVED', note: 'Order placed', createdAt: placedAt },
  ];

  if (status === 'CANCELLED') {
    events.push({
      status: 'CANCELLED',
      note: 'Cancelled by customer request',
      createdAt: addMinutes(placedAt, 5),
    });
    return events;
  }

  if (['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
    events.push({
      status: 'PREPARING',
      note: 'Branch accepted and started preparing',
      createdAt: addMinutes(placedAt, 3),
    });
  }

  if (['READY', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
    events.push({
      status: 'READY',
      note: 'Order is ready',
      createdAt: addMinutes(placedAt, 20),
    });
  }

  if (['OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
    events.push({
      status: 'OUT_FOR_DELIVERY',
      note: 'Driver picked up the order',
      createdAt: addMinutes(placedAt, 25),
    });
  }

  if (status === 'DELIVERED') {
    events.push({
      status: 'DELIVERED',
      note: 'Order delivered successfully',
      createdAt: addMinutes(placedAt, 50),
    });
  }

  return events;
}

// ─── Seed one order ───────────────────────────────────────────────────────────

async function seedOrder(
  spec: (typeof ORDER_SPECS)[0],
  ctx: {
    userId: string;
    storeId: string;
    products: Array<{ id: string; name: string; basePrice: number }>;
    giftProduct: { id: string; name: string } | null;
  },
): Promise<void> {
  const { userId, storeId, products, giftProduct } = ctx;
  const placedAt = daysAgoAt(spec.daysAgo, spec.hour);
  const updatedAt = addMinutes(placedAt, 55);
  const total = spec.subtotal + spec.deliveryFee + spec.convenientFee;

  const pickedProducts: Array<{
    productId: string;
    productName: string;
    qty: number;
    unitPrice: number;
  }> = [];

  if (spec.productNames?.length) {
    for (const name of spec.productNames) {
      const fromCatalog = products.find((p) => p.name === name);
      const product =
        fromCatalog ??
        (await prisma.product.findFirst({
          where: { name, isAvailable: true },
          select: { id: true, name: true, basePrice: true },
        }));
      if (!product) {
        throw new Error(`Product "${name}" not found or unavailable.`);
      }
      pickedProducts.push({
        productId: product.id,
        productName: product.name,
        qty: 1,
        unitPrice: product.basePrice,
      });
    }
  } else {
    const paidCatalog =
      spec.includeLoyaltyGift && giftProduct
        ? products.filter((p) => p.id !== giftProduct.id)
        : products;

    pickedProducts.push(
      ...paidCatalog.slice(0, Math.min(spec.itemCount, paidCatalog.length)).map((p, i) => {
        const qty = i === 0 ? Math.max(1, Math.floor(spec.itemCount / 2)) : 1;
        return { productId: p.id, productName: p.name, qty, unitPrice: p.basePrice };
      }),
    );
  }

  if (spec.includeLoyaltyGift) {
    if (!giftProduct) {
      throw new Error(`Loyalty gift product "${GIFT_PRODUCT_NAME}" not found.`);
    }
    pickedProducts.push({
      productId: giftProduct.id,
      productName: `${giftProduct.name} (FREE)`,
      qty: 1,
      unitPrice: 0,
    });
  }

  const statusEvents = buildStatusEvents(spec.status, placedAt);

  await prisma.order.upsert({
    where: { id: makeOrderId(spec.seq) },
    update: {},
    create: {
      id: makeOrderId(spec.seq),
      orderNumber: makeOrderNumber(spec.seq),
      userId,
      storeId,
      orderMode: 'DELIVERY',
      status: spec.status,
      paymentMethod: spec.paymentMethod,
      paymentStatus: spec.paymentStatus,
      paymentRef: spec.paymentStatus !== 'PENDING' ? `seed-ph-${makeOrderId(spec.seq)}` : null,
      paymentGateway: spec.paymentGateway ?? null,
      prepaidAmount: spec.paymentMethod !== 'CASH_AT_COUNTER' ? total : 0,
      subtotal: spec.subtotal,
      deliveryFee: spec.deliveryFee,
      convenientFee: spec.convenientFee,
      discount: 0,
      loyaltyDiscount: 0,
      total,
      estimatedMinutes: 35,
      channel: spec.channel ?? 'APP',
      notes: spec.notes ?? null,
      promoCode: spec.includeLoyaltyGift ? LOYALTY_OFFER2_CODE : null,
      cancelReason: spec.status === 'CANCELLED' ? 'CUSTOMER_REQUEST' : null,
      cancelledBy: spec.status === 'CANCELLED' ? 'customer' : null,
      cancelWindowStartsAt: placedAt,
      deliveryAddressLine: spec.addressLine,
      deliveryCity: spec.city,
      deliveryDistrict: spec.district,
      deliveryLat: spec.lat ?? 6.8 + spec.seq * 0.005,
      deliveryLng: spec.lng ?? 79.88 + spec.seq * 0.003,
      createdAt: placedAt,
      updatedAt,
      items: {
        create: pickedProducts.map((p) => ({
          id: crypto.randomUUID(),
          productId: p.productId,
          productName: p.productName,
          size: 'REGULAR',
          quantity: p.qty,
          unitPrice: p.unitPrice,
          totalPrice: p.unitPrice * p.qty,
        })),
      },
      statusEvents: {
        create: statusEvents,
      },
    },
  });
}

function parseLimitArg(args: string[]): number | null {
  const idx = args.findIndex((a) => a === '--limit');
  if (idx === -1) return null;
  const raw = args[idx + 1];
  if (raw === undefined || raw.startsWith('--')) {
    console.error('\n❌  --limit requires a positive integer.\n');
    process.exit(1);
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    console.error('\n❌  --limit must be a positive integer.\n');
    process.exit(1);
  }
  return n;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const doClean = args.includes('--clean');
  const limitArg = parseLimitArg(args);
  const specs =
    limitArg === null ? ORDER_SPECS : ORDER_SPECS.slice(0, Math.min(limitArg, ORDER_SPECS.length));

  console.log('\n🌱  Chamathka Prasad — Delivery Order Seeder');
  console.log('─'.repeat(50));

  const phoneVariants = phoneLookupVariants(CUSTOMER_PHONE);
  let user = await prisma.user.findFirst({
    where: { phone: { in: phoneVariants } },
    select: { id: true, name: true, phone: true },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Chamathka Prasad',
        phone: normalizePhone(CUSTOMER_PHONE),
        isPhoneVerified: true,
      },
      select: { id: true, name: true, phone: true },
    });
    console.log(`✅  Created user: ${user.name} (${user.phone}) — ID: ${user.id}`);
  }
  console.log(`✅  Found user: ${user.name} (${user.phone}) — ID: ${user.id}`);

  if (doClean) {
    const deleted = await cleanExistingOrders();
    console.log(`🗑   Cleaned ${deleted} existing seed order(s).`);
  }

  const dartCodesStore = await prisma.store.findFirst({
    where: {
      isActive: true,
      OR: [
        { name: { equals: 'Bing Chun - Nugegoda' } },
        { name: { contains: 'Nugegoda', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true },
  });
  if (!dartCodesStore) {
    console.error('\n❌  Nugegoda store not found or inactive. Cannot seed orders.\n');
    process.exit(1);
  }
  console.log(`🏪  Using store: ${dartCodesStore.name} (${dartCodesStore.id})`);

  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    select: { id: true, name: true, basePrice: true },
    orderBy: { sortOrder: 'asc' },
    take: 15,
  });
  if (products.length === 0) {
    console.error('\n❌  No available products found. Cannot seed orders.\n');
    process.exit(1);
  }
  console.log(`🍱  Found ${products.length} product(s) to use for line items.`);

  const giftProduct = await prisma.product.findFirst({
    where: { name: GIFT_PRODUCT_NAME, isAvailable: true },
    select: { id: true, name: true },
  });
  if (specs.some((s) => s.includeLoyaltyGift) && !giftProduct) {
    console.error(`\n❌  Gift product "${GIFT_PRODUCT_NAME}" not found or unavailable.\n`);
    process.exit(1);
  }
  if (giftProduct) {
    console.log(`🍦  Gift product: ${giftProduct.name} (${giftProduct.id})\n`);
  } else {
    console.log('');
  }

  const results: Array<{
    seq: number;
    orderNumber: string;
    status: OrderStatus;
    store: string;
    total: number;
  }> = [];

  if (limitArg !== null) {
    console.log(`📌  Seeding first ${specs.length} order spec(s) (--limit ${limitArg}).\n`);
  }

  for (const spec of specs) {
    const store = dartCodesStore;
    const total = spec.subtotal + spec.deliveryFee + spec.convenientFee;

    try {
      await seedOrder(spec, { userId: user.id, storeId: store.id, products, giftProduct });
      results.push({
        seq: spec.seq,
        orderNumber: makeOrderNumber(spec.seq),
        status: spec.status,
        store: store.name,
        total,
      });
      process.stdout.write(
        `  ✔  ${makeOrderNumber(spec.seq)}  ${spec.status.padEnd(18)} ${store.name}\n`,
      );
    } catch (err) {
      console.error(`  ✘  ${makeOrderNumber(spec.seq)} failed:`, err);
    }
  }

  console.log('\n' + '─'.repeat(65));
  console.log('📋  Summary');
  console.log('─'.repeat(65));
  console.log(
    `${'#'.padEnd(4)} ${'Order No.'.padEnd(14)} ${'Status'.padEnd(20)} ${'Store'.padEnd(18)} Total`,
  );
  console.log('─'.repeat(65));
  for (const r of results) {
    console.log(
      `${String(r.seq).padEnd(4)} ${r.orderNumber.padEnd(14)} ${r.status.padEnd(20)} ${r.store.padEnd(18)} LKR ${r.total}`,
    );
  }
  console.log('─'.repeat(65));
  console.log(`\n✅  Seeded ${results.length} / ${specs.length} orders for ${user.name}.\n`);
}

main()
  .catch((err) => {
    console.error('\n❌  Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
