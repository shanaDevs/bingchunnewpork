/**
 * Bambalapitiya DELIVERY orders for Dinuka Gayan — 3 orders, ≥10 line items,
 * each line with a distinct topping combination (READY + PAID for delivery pool).
 *
 * Run:
 *   cd backend && npm run seed:bambalapitiya-delivery
 *   cd backend && npm run seed:bambalapitiya-delivery -- --clean
 *
 * Verify:
 *   Admin → Delivery (or Orders): filter Bambalapitiya; 3 READY DELIVERY orders.
 *   Open an order: each line shows different toppings.
 *   Optional driver smoke (backend must be running):
 *     npx ts-node --transpile-only scripts/broadcast-bambalapitiya-job.ts
 *
 * Production: set ALLOW_SEED_ORDER_IN_PRODUCTION=true if you use assertLiveOrderSeedAllowed elsewhere;
 * this script does not call that guard (local Dinuka smoke).
 * PgBouncer: use PRISMA_DIRECT_URL via prisma-use-direct-url.cjs (npm script wraps it).
 */
import type { OrderStatus, ProductSize } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { batchResolveLinePricing } from '../src/lib/pricing';
import { generateOrderNumber } from '../src/utils/orderNumber';
import { normalizePhone } from '../src/utils/phone';
import { storeIdFromName } from '../prisma/data/stores';

const SEED_NOTE = 'seed-bambalapitiya-delivery-';
const BAMBALAPITIYA_STORE_NAME = 'Bing Chun - Bambalapitiya';
const BAMBALAPITIYA_STORE_ID = storeIdFromName(BAMBALAPITIYA_STORE_NAME);

const PHONE = normalizePhone('0762843595');
const NAME = 'Dinuka Gayan';

const ORDER_COUNT = 3;
const MIN_LINES = 10;
const DELIVERY_FEE = 200;

/** Line counts per order (sum ≥ MIN_LINES). */
const LINES_PER_ORDER = [4, 3, 3] as const;

const STOPS = [
  {
    label: 'Home',
    addressLine: '45 Galle Road',
    city: 'Colombo',
    district: 'Colombo',
    lat: 6.8995,
    lng: 79.8565,
  },
  {
    label: 'Office',
    addressLine: '120 Duplication Road',
    city: 'Colombo',
    district: 'Colombo',
    lat: 6.8938,
    lng: 79.8572,
  },
  {
    label: 'Marine Drive',
    addressLine: '88 Marine Drive',
    city: 'Colombo',
    district: 'Colombo',
    lat: 6.8978,
    lng: 79.8521,
  },
] as const;

type LineSpec = { productId: string; size: ProductSize; toppingIds: string[]; quantity: number };

type CatalogProduct = {
  id: string;
  name: string;
  basePrice: number;
  toppings: Array<{ toppingId: string; topping: { id: string; name: string; extraPrice: number; isAvailable: boolean } }>;
};

function comboKey(toppingIds: string[]): string {
  return toppingIds.slice().sort().join(',');
}

/** Build ≥MIN_LINES unique topping combos across catalog products. */
function buildLineSpecs(catalog: CatalogProduct[], counts: readonly number[]): LineSpec[] {
  const usedCombos = new Set<string>();
  const specs: LineSpec[] = [];
  let productIdx = 0;

  const productsWithToppings = catalog.filter((p) => p.toppings.some((t) => t.topping.isAvailable));
  if (productsWithToppings.length < 3) {
    throw new Error(
      `Need at least 3 in-stock products with available toppings at ${BAMBALAPITIYA_STORE_NAME}. Run menu/catalog seed first.`,
    );
  }

  const totalNeeded = counts.reduce((a, b) => a + b, 0);
  if (totalNeeded < MIN_LINES) {
    throw new Error(`LINES_PER_ORDER must sum to at least ${MIN_LINES}`);
  }

  for (const lineCount of counts) {
    for (let i = 0; i < lineCount; i++) {
      const product = productsWithToppings[productIdx % productsWithToppings.length];
      productIdx++;

      const available = product.toppings
        .map((t) => t.topping)
        .filter((t) => t.isAvailable);
      if (available.length === 0) continue;

      const size: ProductSize = specs.length % 4 === 3 ? 'LARGE' : 'REGULAR';
      let toppingIds: string[] = [];
      let attempts = 0;

      while (attempts < 40) {
        const numToppings = 1 + (attempts % Math.min(3, available.length));
        const shuffled = [...available].sort((a, b) => ((a.id.charCodeAt(0) + attempts) % 7) - ((b.id.charCodeAt(0) + attempts) % 7));
        toppingIds = shuffled.slice(0, numToppings).map((t) => t.id);
        const key = `${product.id}:${size}:${comboKey(toppingIds)}`;
        if (!usedCombos.has(key)) {
          usedCombos.add(key);
          break;
        }
        attempts++;
      }

      if (attempts >= 40 && toppingIds.length === 0) {
        toppingIds = [available[specs.length % available.length].id];
      }

      specs.push({
        productId: product.id,
        size,
        toppingIds,
        quantity: 1 + (specs.length % 2),
      });

      if (specs.length >= totalNeeded) return specs;
    }
  }

  return specs;
}

function splitSpecsForOrders(
  specs: LineSpec[],
  counts: readonly number[],
): LineSpec[][] {
  const out: LineSpec[][] = [];
  let offset = 0;
  for (const n of counts) {
    out.push(specs.slice(offset, offset + n));
    offset += n;
  }
  return out;
}

function buildStatusEvents(): Array<{ status: OrderStatus; note: string }> {
  return [
    { status: 'RECEIVED', note: 'Placed' },
    { status: 'PREPARING', note: 'Kitchen' },
    { status: 'READY', note: 'Ready for rider' },
  ];
}

async function ensureCustomer() {
  let user = await prisma.user.findFirst({
    where: { phone: { in: [PHONE, '762843595', '+94762843595', '94762843595'] } },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: NAME,
        phone: PHONE,
        isPhoneVerified: true,
      },
    });
    console.log('Created customer', user.id);
    return user;
  }
  if (user.name !== NAME) {
    user = await prisma.user.update({ where: { id: user.id }, data: { name: NAME } });
  }
  console.log('Using customer', user.id, user.name, user.phone);
  return user;
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

async function loadCatalog(storeId: string): Promise<CatalogProduct[]> {
  const rows = await prisma.storeProduct.findMany({
    where: {
      storeId,
      stock: { gt: 0 },
      product: { isAvailable: true },
    },
    select: {
      productId: true,
      product: {
        select: {
          id: true,
          name: true,
          basePrice: true,
          toppings: {
            include: { topping: true },
          },
        },
      },
    },
    orderBy: { product: { name: 'asc' } },
    take: 20,
  });

  return rows.map((r) => ({
    id: r.product.id,
    name: r.product.name,
    basePrice: r.product.basePrice,
    toppings: r.product.toppings,
  }));
}

async function main() {
  const doClean = process.argv.includes('--clean');

  const store = await prisma.store.findFirst({
    where: {
      isActive: true,
      OR: [{ id: BAMBALAPITIYA_STORE_ID }, { name: { equals: BAMBALAPITIYA_STORE_NAME } }],
    },
    select: { id: true, name: true, lat: true, lng: true, deliveryEnabled: true },
  });
  if (!store) throw new Error(`Branch not found: ${BAMBALAPITIYA_STORE_NAME}`);
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
      select: {
        orderNumber: true,
        status: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const lineTotal = rows.reduce((s, r) => s + r._count.items, 0);
    console.log(`Store: ${store.name}`);
    console.log(`Already have ${rows.length} seed orders (${lineTotal} lines). Use --clean to replace:`);
    for (const row of rows) {
      console.log(`  ${row.orderNumber}  ${row.status}  ${row._count.items} item(s)`);
    }
    return;
  }

  const user = await ensureCustomer();
  const catalog = await loadCatalog(store.id);
  if (catalog.length === 0) {
    throw new Error(`No in-stock products at ${store.name}. Restock before seeding.`);
  }

  const allSpecs = buildLineSpecs(catalog, LINES_PER_ORDER);
  if (allSpecs.length < MIN_LINES) {
    throw new Error(`Could only build ${allSpecs.length} line specs; need ${MIN_LINES}.`);
  }

  const pricingInputs = allSpecs.map((s) => ({
    productId: s.productId,
    size: s.size,
    toppingIds: s.toppingIds,
  }));
  const pricing = await batchResolveLinePricing(pricingInputs);

  const productNameById = new Map(catalog.map((p) => [p.id, p.name]));
  const specsByOrder = splitSpecsForOrders(allSpecs, LINES_PER_ORDER);

  console.log(`Store: ${store.name} (${store.id})`);
  console.log(`Seeding ${ORDER_COUNT} orders, ${allSpecs.length} lines for ${NAME}…\n`);

  const created: Array<{ orderNumber: string; lines: number; total: number }> = [];

  for (let o = 0; o < ORDER_COUNT; o++) {
    const stop = STOPS[o];
    const orderSpecs = specsByOrder[o];

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
          lat: stop.lat,
          lng: stop.lng,
          isDefault: o === 0,
        },
      });
    }

    let subtotal = 0;
    const itemCreates: Array<{
      productId: string;
      productName: string;
      size: ProductSize;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      toppings: { create: Array<{ toppingId: string; toppingName: string; extraPrice: number }> };
    }> = [];

    for (const spec of orderSpecs) {
      const priceKey = `${spec.productId}:${spec.size}:${spec.toppingIds.join(',')}`;
      const resolved = pricing.get(priceKey);
      if (!resolved) throw new Error(`Pricing missing for ${priceKey}`);

      const lineTotal = resolved.unitPrice * spec.quantity;
      subtotal += lineTotal;

      itemCreates.push({
        productId: spec.productId,
        productName: productNameById.get(spec.productId) ?? 'Product',
        size: spec.size,
        quantity: spec.quantity,
        unitPrice: resolved.unitPrice,
        totalPrice: lineTotal,
        toppings: {
          create: resolved.toppings.map((t) => ({
            toppingId: t.toppingId,
            toppingName: t.topping.name,
            extraPrice: t.topping.extraPrice,
          })),
        },
      });
    }

    const total = subtotal + DELIVERY_FEE;
    const orderNumber = generateOrderNumber();

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: user.id,
        guestName: NAME,
        guestPhone: PHONE,
        storeId: store.id,
        addressId: address.id,
        orderMode: 'DELIVERY',
        status: 'READY',
        paymentMethod: 'PAYHERE',
        paymentStatus: 'PAID',
        prepaidAmount: total,
        subtotal,
        deliveryFee: DELIVERY_FEE,
        total,
        estimatedMinutes: 30,
        notes: `${SEED_NOTE}${o + 1}`,
        deliveryAddressLine: stop.addressLine,
        deliveryCity: stop.city,
        deliveryDistrict: stop.district,
        deliveryLat: stop.lat,
        deliveryLng: stop.lng,
        channel: 'APP',
        items: { create: itemCreates },
        statusEvents: { create: buildStatusEvents() },
      },
      select: { orderNumber: true },
    });

    created.push({ orderNumber: order.orderNumber, lines: orderSpecs.length, total });
    console.log(
      `  ✔  ${order.orderNumber}  ${orderSpecs.length} lines  LKR ${total}  →  ${stop.addressLine}`,
    );
  }

  console.log(`\nDone — ${ORDER_COUNT} delivery orders at ${store.name} (${allSpecs.length} lines with varied toppings).`);
  for (const row of created) {
    console.log(`   ${row.orderNumber}: ${row.lines} items, LKR ${row.total}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
