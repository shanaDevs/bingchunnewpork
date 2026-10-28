/**
 * Pilot monthly order seed — default: one store (Nugegoda), 25 orders, current month.
 *
 *   set ALLOW_MONTHLY_ORDER_SEED=true
 *   npm run seed:monthly-orders -w @bingchun/backend
 *
 * Optional env:
 *   PILOT_STORE_NAME=Nugegoda
 *   MONTHLY_ORDER_COUNT=25
 *   MONTHLY_ALL_STORES=false
 *   MONTHLY_ORDERS_PER_STORE=25  (when MONTHLY_ALL_STORES=true)
 */

import crypto from 'crypto';
import {
  OrderMode,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  ProductSize,
} from '@prisma/client';

function assertAllowed(): void {
  if (process.env.ALLOW_MONTHLY_ORDER_SEED !== 'true') {
    throw new Error('Set ALLOW_MONTHLY_ORDER_SEED=true to run monthly order seed');
  }
}

const prisma = new PrismaClient();
const PREFIX = 'seed-month-';

const STATUSES: OrderStatus[] = [
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'CANCELLED',
  'CANCELLED',
  'RECEIVED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

type Spec = {
  seq: number;
  status: OrderStatus;
  orderMode: OrderMode;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  dayOfMonth: number;
  hour: number;
  withRefund?: boolean;
};

function buildSpecs(count: number): Spec[] {
  const modes: OrderMode[] = ['DELIVERY', 'TAKEAWAY', 'DELIVERY', 'TAKEAWAY'];
  const payments: PaymentMethod[] = [
    'PAYHERE',
    'CARD',
    'CASH_AT_COUNTER',
    'PAYHERE',
    'PAYHERE',
    'CARD',
    'CASH_AT_COUNTER',
    'CARD',
  ];
  const specs: Spec[] = [];
  for (let i = 1; i <= count; i++) {
    const status = STATUSES[(i - 1) % STATUSES.length] ?? 'DELIVERED';
    const orderMode = modes[(i - 1) % modes.length];
    let paymentMethod = payments[(i - 1) % payments.length];
    if (orderMode === 'DELIVERY' && paymentMethod === 'CASH_AT_COUNTER') {
      paymentMethod = 'PAYHERE';
    }
    const paymentStatus: PaymentStatus =
      paymentMethod === 'CASH_AT_COUNTER' && status !== 'DELIVERED' ? 'PENDING' : 'PAID';
    specs.push({
      seq: i,
      status,
      orderMode,
      paymentMethod,
      paymentStatus,
      dayOfMonth: Math.min(28, 1 + ((i - 1) % 28)),
      hour: 9 + ((i * 2) % 10),
      withRefund: status === 'CANCELLED' && i % 2 === 0,
    });
  }
  return specs;
}

function colomboMonthBounds(): { y: number; m: number; label: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  return { y, m, label: `${y}${String(m).padStart(2, '0')}` };
}

function placedAt(y: number, m: number, day: number, hour: number): Date {
  return new Date(Date.UTC(y, m - 1, day, hour - 5, (day * 3) % 60, 0));
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

function orderId(storeId: string, yyyymm: string, seq: number): string {
  const slug = storeId.replace(/[^a-z0-9-]/gi, '').slice(0, 40);
  return `${PREFIX}${slug}-${yyyymm}-${String(seq).padStart(2, '0')}`;
}

function buildStatusEvents(status: OrderStatus, placed: Date) {
  const events: Array<{ status: OrderStatus; note: string; createdAt: Date }> = [
    { status: 'RECEIVED', note: 'Order placed', createdAt: placed },
  ];
  if (status === 'CANCELLED') {
    events.push({ status: 'CANCELLED', note: 'Cancelled', createdAt: addMinutes(placed, 12) });
    return events;
  }
  if (['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
    events.push({ status: 'PREPARING', note: 'Preparing', createdAt: addMinutes(placed, 5) });
  }
  if (['READY', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
    events.push({ status: 'READY', note: 'Ready', createdAt: addMinutes(placed, 18) });
  }
  if (['OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
    events.push({ status: 'OUT_FOR_DELIVERY', note: 'Out for delivery', createdAt: addMinutes(placed, 25) });
  }
  if (status === 'DELIVERED') {
    events.push({ status: 'DELIVERED', note: 'Delivered', createdAt: addMinutes(placed, 45) });
  }
  return events;
}

async function cleanSeedMonth(): Promise<number> {
  const ids = await prisma.order.findMany({
    where: { id: { startsWith: PREFIX } },
    select: { id: true },
  });
  if (!ids.length) return 0;
  await prisma.walletTransaction.deleteMany({
    where: { OR: [{ id: { startsWith: PREFIX } }, { orderId: { startsWith: PREFIX } }] },
  });
  await prisma.refund.deleteMany({ where: { OR: [{ id: { startsWith: PREFIX } }, { orderId: { startsWith: PREFIX } }] } });
  await prisma.deliveryJob.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.order.deleteMany({ where: { id: { startsWith: PREFIX } } });
  return ids.length;
}

async function seedStoreOrders(
  store: { id: string; name: string; city: string; district: string; lat: number; lng: number },
  specs: Spec[],
  yyyymm: { y: number; m: number; label: string },
  users: { id: string }[],
  products: { id: string; name: string; basePrice: number }[],
  driverId: string | null,
): Promise<void> {
  const deliveredDeliveryIds: string[] = [];

  for (const spec of specs) {
    const id = orderId(store.id, yyyymm.label, spec.seq);
    const placed = placedAt(yyyymm.y, yyyymm.m, spec.dayOfMonth, spec.hour);
    const user = users[(spec.seq - 1) % users.length];
    const product = products[(spec.seq - 1) % products.length];
    const qty = 1 + (spec.seq % 3);
    const subtotal = product.basePrice * qty;
    const deliveryFee = spec.orderMode === 'DELIVERY' ? 150 + (spec.seq % 3) * 50 : 0;
    const convenientFee = Math.round(subtotal * 0.065);
    const discount = spec.seq % 5 === 0 ? 100 : 0;
    const total = Math.max(subtotal + deliveryFee + convenientFee - discount, 0);
    const prepaid = spec.paymentMethod !== 'CASH_AT_COUNTER' ? total : 0;

    const updatedAt =
      spec.status === 'RECEIVED'
        ? placed
        : addMinutes(placed, spec.status === 'DELIVERED' ? 45 : 20);

    await prisma.order.upsert({
      where: { id },
      update: {},
      create: {
        id,
        orderNumber: `BC${yyyymm.label.slice(2)}-${String(spec.seq).padStart(4, '0')}`,
        trackToken: crypto.createHash('sha256').update(id).digest('hex').slice(0, 32),
        userId: user?.id ?? null,
        guestName: user ? undefined : `Guest ${spec.seq}`,
        guestPhone: user ? undefined : `077${String(2000000 + spec.seq).padStart(7, '0')}`,
        storeId: store.id,
        orderMode: spec.orderMode,
        status: spec.status,
        paymentMethod: spec.paymentMethod,
        paymentStatus: spec.paymentStatus,
        paymentRef:
          spec.paymentMethod === 'PAYHERE' || spec.paymentMethod === 'CARD' ? id : null,
        subtotal,
        deliveryFee,
        convenientFee,
        discount,
        loyaltyDiscount: 0,
        total,
        prepaidAmount: prepaid,
        estimatedMinutes: 30,
        platform: spec.seq % 2,
        channel: spec.seq % 2 === 0 ? 'APP' : 'WEB',
        deliveryAddressLine:
          spec.orderMode === 'DELIVERY' ? `${10 + spec.seq} ${store.city} Road` : undefined,
        deliveryCity: spec.orderMode === 'DELIVERY' ? store.city : undefined,
        deliveryDistrict: spec.orderMode === 'DELIVERY' ? store.district : undefined,
        deliveryLat: spec.orderMode === 'DELIVERY' ? store.lat + 0.01 * (spec.seq % 5) : undefined,
        deliveryLng: spec.orderMode === 'DELIVERY' ? store.lng + 0.01 * (spec.seq % 5) : undefined,
        cancelReason: spec.status === 'CANCELLED' ? 'CUSTOMER_REQUEST' : undefined,
        createdAt: placed,
        updatedAt,
        items: {
          create: [
            {
              id: `${id}-item`,
              productId: product.id,
              productName: product.name,
              size: ProductSize.REGULAR,
              quantity: qty,
              unitPrice: product.basePrice,
              totalPrice: subtotal,
            },
          ],
        },
        statusEvents: {
          create: buildStatusEvents(spec.status, placed).map((e, idx) => ({
            id: `${id}-ev-${idx}`,
            status: e.status,
            note: e.note,
            createdAt: e.createdAt,
          })),
        },
      },
    });

    if (
      spec.status === 'DELIVERED' &&
      spec.orderMode === 'DELIVERY' &&
      spec.paymentStatus === 'PAID' &&
      prepaid > 0
    ) {
      deliveredDeliveryIds.push(id);
    }

    if (spec.status === 'CANCELLED' && spec.withRefund && prepaid > 0) {
      const refundAmt = Math.round(total * 0.8);
      await prisma.refund.create({
        data: {
          id: `${PREFIX}refund-${id}`,
          orderId: id,
          customerName: 'Seed customer',
          submittedBy: 'CUSTOMER',
          cancellationReason: 'Customer requested cancellation',
          salesTotal: subtotal,
          deliveryFee,
          convenienceFee: convenientFee,
          orderTotal: total,
          refundPercentage: 80,
          refundAmount: refundAmt,
          cancelledAtStatus: 'PREPARING',
          cancelledWithinWindow: true,
          status: 'COMPLETE',
          processedAt: addMinutes(placed, 60),
          createdAt: addMinutes(placed, 55),
          updatedAt: addMinutes(placed, 60),
        },
      });
    }
  }

  if (deliveredDeliveryIds.length > 0 && driverId) {
    const jobId = `${PREFIX}job-${store.id}-${yyyymm.label}`;
    const scheduled = addMinutes(new Date(), -120);
    await prisma.deliveryJob.upsert({
      where: { id: jobId },
      update: {},
      create: {
        id: jobId,
        storeId: store.id,
        driverId,
        title: `Monthly seed run (${deliveredDeliveryIds.length} stops)`,
        status: 'COMPLETED',
        scheduledAt: scheduled,
        assignedAt: addMinutes(scheduled, 5),
        startedAt: addMinutes(scheduled, 10),
        completedAt: addMinutes(scheduled, 90),
        jobOrders: {
          create: deliveredDeliveryIds.map((orderId, i) => ({
            orderId,
            sequence: i + 1,
          })),
        },
      },
    });
  }
}

async function main(): Promise<void> {
  assertAllowed();

  const allStores = process.env.MONTHLY_ALL_STORES === 'true';
  const perStore = Number(process.env.MONTHLY_ORDERS_PER_STORE ?? process.env.MONTHLY_ORDER_COUNT ?? 25);
  const storeName = process.env.PILOT_STORE_NAME ?? 'Nugegoda';
  const yyyymm = colomboMonthBounds();

  const removed = await cleanSeedMonth();
  if (removed) console.log(`Removed ${removed} prior seed-month orders`);

  const users = await prisma.user.findMany({
    where: { email: { endsWith: '@bingchun-test.lk' } },
    select: { id: true },
    take: 150,
  });
  if (!users.length) {
    console.warn('No @bingchun-test.lk users — run seed:dummy-users first');
  }

  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    select: { id: true, name: true, basePrice: true },
    take: 20,
  });
  if (!products.length) throw new Error('No available products');

  const stores = allStores
    ? await prisma.store.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
    : await prisma.store.findMany({
        where: { isActive: true, name: { contains: storeName, mode: 'insensitive' } },
        take: 1,
      });

  if (!stores.length) throw new Error(`No store matching "${storeName}"`);

  const specs = buildSpecs(perStore);
  let totalOrders = 0;

  for (const store of stores) {
    const driver = await prisma.adminUser.findFirst({
      where: { storeId: store.id, role: { name: 'DELIVERY_DRIVER' }, isActive: true },
      select: { id: true },
    });
    await seedStoreOrders(store, specs, yyyymm, users, products, driver?.id ?? null);
    totalOrders += specs.length;
    console.log(`  ${store.name}: ${specs.length} orders (${yyyymm.label})`);
  }

  console.log(`\nDone: ${totalOrders} seed-month orders across ${stores.length} store(s).`);
  console.log('Next: prisma db execute --file prisma/scripts/backfill_wallets_from_orders.sql');
  console.log('Then: prisma db execute --file prisma/scripts/repair_wallet_balance_after.sql');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
