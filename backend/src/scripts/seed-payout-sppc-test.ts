/**
 * Seeds PAID pickup + delivery orders with a SHARED promo so branch payout / SPPC flows
 * without waiting for a 15-day rolling period to complete.
 *
 * Usage (from repo root or backend/):
 *   npm run seed:payout-test -w @bingchun/backend
 *   npm run seed:payout-test -w @bingchun/backend -- --store-name Nugegoda
 *   npm run seed:payout-test -w @bingchun/backend -- --store-id <uuid> --clean
 *   npm run seed:payout-test -w @bingchun/backend -- --reset-store-orders --store-name Nugegoda
 *
 * Flags:
 *   --store-name <text>     Branch name substring (default: Nugegoda)
 *   --store-id <uuid>       Exact store id (overrides --store-name)
 *   --clean                 Remove previous seed-payout-* orders for this store
 *   --reset-store-orders    Dev only: delete ALL orders, withdrawals, wallet txs for the store
 *   --orders <n>            Number of pickup seed orders (default: 6)
 *   --delivery-orders <n>   Number of delivery seed orders (default: 2)
 *   --anchor-days <n>       First order N days before today (default: 20 → 15-day period complete)
 *   --promo-code <code>     Shared promo code (default: SPPCTEST20)
 *   --contribution-source   PLATFORM or JASON (default: PLATFORM)
 */
import crypto from 'crypto';
import { assertDevSeedOnly } from './seedGuard';
assertDevSeedOnly();
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../lib/prisma';
import { buildPromotionUsageRecord } from '../lib/promotionUsage';
import { syncMissingWalletPayments } from '../lib/walletSync';
import {
  addDaysToDateStr,
  resolvePayoutPeriod,
  todayDateStr,
} from '../lib/withdrawalService';
import { computeBreakdownForPeriod, getWalletSummary } from '../lib/walletService';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const SEED_ORDER_ID_PREFIX = 'seed-payout-';
const DEFAULT_PROMO_CODE = 'SPPCTEST20';

type ContributionSource = 'PLATFORM' | 'JASON';

type SeedOptions = {
  storeName: string;
  storeId?: string;
  clean: boolean;
  resetStoreOrders: boolean;
  orderCount: number;
  deliveryOrderCount: number;
  anchorDaysAgo: number;
  promoCode: string;
  branchSharePct: number;
  platformSharePct: number;
  discountPct: number;
  contributionSource: ContributionSource;
};

type StoreRow = {
  id: string;
  name: string;
  platformDiscountPaybackEnabled: boolean;
  lat: number | null;
  lng: number | null;
};

type PromoRow = { id: string; code: string };

type SeedOrderSpec = {
  index: number;
  orderDate: string;
  orderMode: 'TAKEAWAY' | 'DELIVERY';
  subtotal: number;
  deliveryFee: number;
  convenientFee: number;
};

type SeedOrderResult = {
  orderNumber: string;
  orderDate: string;
  orderMode: 'TAKEAWAY' | 'DELIVERY';
  subtotal: number;
  discount: number;
  totalDiscountAmount: number;
  platformShare: number;
};

function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  const opts: SeedOptions = {
    storeName: 'Nugegoda',
    clean: false,
    resetStoreOrders: false,
    orderCount: 6,
    deliveryOrderCount: 2,
    anchorDaysAgo: 20,
    promoCode: DEFAULT_PROMO_CODE,
    branchSharePct: 40,
    platformSharePct: 60,
    discountPct: 20,
    contributionSource: 'PLATFORM',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--store-name':
        if (next) opts.storeName = next;
        i++;
        break;
      case '--store-id':
        if (next) opts.storeId = next;
        i++;
        break;
      case '--clean':
        opts.clean = true;
        break;
      case '--reset-store-orders':
        opts.resetStoreOrders = true;
        opts.clean = true;
        break;
      case '--orders':
        if (next != null) {
          const n = parseInt(next, 10);
          opts.orderCount = Number.isNaN(n) ? 6 : Math.max(0, n);
        }
        i++;
        break;
      case '--delivery-orders':
        if (next != null) {
          const n = parseInt(next, 10);
          opts.deliveryOrderCount = Number.isNaN(n) ? 2 : Math.max(0, n);
        }
        i++;
        break;
      case '--anchor-days':
        if (next) opts.anchorDaysAgo = Math.max(15, parseInt(next, 10) || 20);
        i++;
        break;
      case '--promo-code':
        if (next) opts.promoCode = next.toUpperCase();
        i++;
        break;
      case '--branch-pct':
        if (next) opts.branchSharePct = parseInt(next, 10) || 40;
        i++;
        break;
      case '--platform-pct':
        if (next) opts.platformSharePct = parseInt(next, 10) || 60;
        i++;
        break;
      case '--discount-pct':
        if (next) opts.discountPct = parseInt(next, 10) || 20;
        i++;
        break;
      case '--contribution-source':
        if (next) {
          const source = next.toUpperCase();
          if (source === 'PLATFORM' || source === 'JASON') {
            opts.contributionSource = source;
          }
        }
        i++;
        break;
      default:
        break;
    }
  }

  return opts;
}

function orderTimestamp(dateStr: string, hour: number): Date {
  const h = String(hour).padStart(2, '0');
  return new Date(`${dateStr}T${h}:30:00.000Z`);
}

function computeDiscount(subtotal: number, discountPct: number): number {
  return Math.min(subtotal, Math.floor((subtotal * discountPct) / 100));
}

function orderDateAtIndex(
  index: number,
  total: number,
  periodStart: string,
  lastOrderDay: string,
): string {
  const startMs = new Date(`${periodStart}T00:00:00.000Z`).getTime();
  const endMs = new Date(`${lastOrderDay}T00:00:00.000Z`).getTime();
  const span = Math.max(endMs - startMs, 0);
  const orderMs =
    total <= 1 ? startMs : startMs + Math.round((span * index) / (total - 1));
  return new Date(orderMs).toISOString().slice(0, 10);
}

function buildOrderSpecs(
  pickupCount: number,
  deliveryCount: number,
  periodStart: string,
  lastOrderDay: string,
  subtotals: number[],
  indexOffset = 0,
  existingOrderCount = 0,
): SeedOrderSpec[] {
  const newTotal = pickupCount + deliveryCount;
  if (newTotal === 0) return [];

  const grandTotal = existingOrderCount + newTotal;
  const specs: SeedOrderSpec[] = [];
  let subtotalIdx = existingOrderCount;

  for (let i = 0; i < pickupCount; i++) {
    const slot = existingOrderCount + specs.length;
    specs.push({
      index: indexOffset + specs.length,
      orderDate: orderDateAtIndex(slot, grandTotal, periodStart, lastOrderDay),
      orderMode: 'TAKEAWAY',
      subtotal: subtotals[subtotalIdx++ % subtotals.length] ?? 3200,
      deliveryFee: 0,
      convenientFee: 0,
    });
  }

  for (let i = 0; i < deliveryCount; i++) {
    const slot = existingOrderCount + specs.length;
    specs.push({
      index: indexOffset + specs.length,
      orderDate: orderDateAtIndex(slot, grandTotal, periodStart, lastOrderDay),
      orderMode: 'DELIVERY',
      subtotal: subtotals[subtotalIdx++ % subtotals.length] ?? 3800,
      deliveryFee: 250,
      convenientFee: 50,
    });
  }

  return specs;
}

async function createSeedOrder(
  spec: SeedOrderSpec,
  ctx: {
    store: StoreRow;
    product: { id: string; name: string; basePrice: number };
    promo: PromoRow;
    opts: SeedOptions;
  },
): Promise<SeedOrderResult> {
  const { store, product, promo, opts } = ctx;
  const isDelivery = spec.orderMode === 'DELIVERY';
  const storeSlug = store.id.replace(/[^a-z0-9]/gi, '').slice(-10).toLowerCase();
  const orderId = `${SEED_ORDER_ID_PREFIX}${storeSlug}-${isDelivery ? 'd' : 'p'}${String(spec.index + 1).padStart(3, '0')}`;
  const branchTag = storeSlug.slice(0, 4).toUpperCase();
  const orderNumber = isDelivery
    ? `SPPC-${branchTag}-D-${spec.orderDate.replace(/-/g, '')}-${String(spec.index + 1).padStart(2, '0')}`
    : `SPPC-${branchTag}-${spec.orderDate.replace(/-/g, '')}-${String(spec.index + 1).padStart(2, '0')}`;
  const qty = 2 + (spec.index % 2);
  const subtotal = spec.subtotal;
  const discount = computeDiscount(subtotal, opts.discountPct);
  const total = subtotal + spec.deliveryFee + spec.convenientFee - discount;
  const createdAt = orderTimestamp(spec.orderDate, 10 + (spec.index % 8));
  const storeLat = store.lat ?? 6.9271;
  const storeLng = store.lng ?? 79.8612;
  const deliveryLat = storeLat + 0.0025 * (1 + (spec.index % 3));
  const deliveryLng = storeLng + 0.0018 * (1 + (spec.index % 2));

  await prisma.order.create({
    data: {
      id: orderId,
      orderNumber,
      storeId: store.id,
      guestName: 'SPPC Test Customer',
      guestPhone: '94771234567',
      orderMode: spec.orderMode,
      status: 'DELIVERED',
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PAID',
      paymentRef: `seed-ph-${orderId}`,
      prepaidAmount: total,
      subtotal,
      deliveryFee: spec.deliveryFee,
      convenientFee: spec.convenientFee,
      discount,
      total,
      promoCode: promo.code,
      estimatedMinutes: isDelivery ? 35 : 15,
      channel: isDelivery ? 'APP' : 'WEB',
      notes: isDelivery
        ? 'SPPC payout test seed — delivery order'
        : 'SPPC payout test seed — pickup order',
      ...(isDelivery
        ? {
            deliveryAddressLine: `${120 + spec.index} High Level Road`,
            deliveryCity: 'Colombo',
            deliveryDistrict: 'Colombo',
            deliveryLat,
            deliveryLng,
          }
        : {}),
      createdAt,
      updatedAt: createdAt,
      items: {
        create: [
          {
            id: crypto.randomUUID(),
            productId: product.id,
            productName: product.name,
            size: 'REGULAR',
            quantity: qty,
            unitPrice: Math.floor(subtotal / qty),
            totalPrice: subtotal,
          },
        ],
      },
      statusEvents: {
        create: isDelivery
          ? [
              { status: 'RECEIVED', note: 'Seed delivery placed', createdAt },
              { status: 'PREPARING', note: 'Kitchen', createdAt },
              { status: 'OUT_FOR_DELIVERY', note: 'Rider dispatched', createdAt },
              { status: 'DELIVERED', note: 'Seed delivery completed', createdAt },
            ]
          : [
              { status: 'RECEIVED', note: 'Seed order placed', createdAt },
              { status: 'DELIVERED', note: 'Seed order completed', createdAt },
            ],
      },
    },
  });

  const usageData = buildPromotionUsageRecord({
    orderId,
    storeId: store.id,
    subtotal,
    deliveryFee: spec.deliveryFee,
    orderDiscount: discount,
    promo: {
      id: promo.id,
      code: promo.code,
      ownership: 'SHARED',
      contributionSource: opts.contributionSource,
      branchSharePct: opts.branchSharePct,
      platformSharePct: opts.platformSharePct,
      promotionKind: 'PERCENTAGE_DISCOUNT',
      promotionRules: null,
      discountType: 'PERCENTAGE',
      discountValue: opts.discountPct,
    },
    cartItems: [
      {
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unitPrice: Math.floor(subtotal / qty),
        lineTotal: subtotal,
      },
    ],
    storePaybackEnabled: store.platformDiscountPaybackEnabled,
  });

  await prisma.promotionUsage.create({
    data: {
      id: crypto.randomUUID(),
      ...usageData,
      createdAt,
    },
  });

  return {
    orderNumber,
    orderDate: spec.orderDate,
    orderMode: spec.orderMode,
    subtotal,
    discount,
    totalDiscountAmount: usageData.totalDiscountAmount,
    platformShare: usageData.platformShareAmount,
  };
}

async function resolveStore(opts: SeedOptions): Promise<StoreRow> {
  if (opts.storeId) {
    const store = await prisma.store.findUnique({
      where: { id: opts.storeId },
      select: {
        id: true,
        name: true,
        platformDiscountPaybackEnabled: true,
        lat: true,
        lng: true,
      },
    });
    if (!store) throw new Error(`Store not found: ${opts.storeId}`);
    return store;
  }

  const store = await prisma.store.findFirst({
    where: { name: { contains: opts.storeName }, isActive: true },
    select: {
      id: true,
      name: true,
      platformDiscountPaybackEnabled: true,
      lat: true,
      lng: true,
    },
  });
  if (!store) {
    throw new Error(
      `No active store matching "${opts.storeName}". Use --store-name or --store-id.`,
    );
  }
  return store;
}

async function countExistingSeedOrders(storeId: string): Promise<number> {
  return prisma.order.count({
    where: { storeId, id: { startsWith: SEED_ORDER_ID_PREFIX } },
  });
}

async function deleteSeedOrders(storeId: string) {
  const seedOrders = await prisma.order.findMany({
    where: { storeId, id: { startsWith: SEED_ORDER_ID_PREFIX } },
    select: { id: true },
  });
  if (seedOrders.length === 0) return 0;

  const orderIds = seedOrders.map((o) => o.id);
  await prisma.promotionUsage.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.walletTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  return orderIds.length;
}

async function resetStoreOrderData(storeId: string) {
  const orders = await prisma.order.findMany({
    where: { storeId },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  if (orderIds.length > 0) {
    await prisma.promotionUsage.deleteMany({ where: { orderId: { in: orderIds } } });
  }
  await prisma.walletTransaction.deleteMany({ where: { storeId } });
  await prisma.storeWithdrawal.deleteMany({ where: { storeId } });
  await prisma.order.deleteMany({ where: { storeId } });

  await prisma.storeWallet.upsert({
    where: { storeId },
    create: {
      id: crypto.randomUUID(),
      storeId,
      balance: 0,
      totalEarnings: 0,
      totalWithdrawn: 0,
    },
    update: {
      balance: 0,
      totalEarnings: 0,
      totalWithdrawn: 0,
      lastSettledAt: null,
    },
  });
}

async function ensureSharedPromo(
  storeId: string,
  opts: SeedOptions,
): Promise<{ id: string; code: string }> {
  const code = opts.promoCode;
  const promo = await prisma.promoCode.upsert({
    where: { code },
    create: {
      id: crypto.randomUUID(),
      code,
      title: 'SPPC payout test (SHARED)',
      description: 'Dev seed — shared branch/platform discount split',
      promotionKind: 'PERCENTAGE_DISCOUNT',
      ownership: 'SHARED',
      branchSharePct: opts.branchSharePct,
      platformSharePct: opts.platformSharePct,
      discountType: 'PERCENTAGE',
      discountValue: opts.discountPct,
      minOrderValue: 0,
      isActive: true,
      storeIds: [storeId],
      showOnHome: false,
      contributionSource: opts.contributionSource,
    },
    update: {
      title: 'SPPC payout test (SHARED)',
      ownership: 'SHARED',
      branchSharePct: opts.branchSharePct,
      platformSharePct: opts.platformSharePct,
      discountType: 'PERCENTAGE',
      discountValue: opts.discountPct,
      isActive: true,
      storeIds: [storeId],
      deletedAt: null,
      contributionSource: opts.contributionSource,
    },
    select: { id: true, code: true },
  });
  return promo;
}

async function main() {
  const opts = parseArgs();
  const store = await resolveStore(opts);

  console.log('🌱  Payout / SPPC test seed');
  console.log(`    Store: ${store.name} (${store.id})\n`);

  if (opts.resetStoreOrders) {
    console.log('⚠️   --reset-store-orders: wiping all orders, withdrawals, and wallet txs…');
    await resetStoreOrderData(store.id);
    console.log('    Done.\n');
  } else if (opts.clean) {
    const removed = await deleteSeedOrders(store.id);
    console.log(`🧹  Removed ${removed} previous seed-payout-* order(s).\n`);
  }

  const pendingWithdrawal = await prisma.storeWithdrawal.findFirst({
    where: { storeId: store.id, status: 'PENDING' },
    select: { id: true, periodFrom: true, periodTo: true },
  });
  if (pendingWithdrawal) {
    console.warn(
      '⚠️   This store has a PENDING withdrawal — cancel or approve it before testing a new period.',
    );
  }

  const product = await prisma.product.findFirst({
    where: { isAvailable: true },
    select: { id: true, name: true, basePrice: true },
    orderBy: { name: 'asc' },
  });
  if (!product) throw new Error('No available products. Run prisma:seed first.');

  const promo = await ensureSharedPromo(store.id, opts);
  const secondPartyLabel = opts.contributionSource === 'JASON' ? 'Jason' : 'Platform';
  console.log(
    `🏷️   Promo: ${promo.code} (SHARED ${opts.branchSharePct}% branch / ${opts.platformSharePct}% ${secondPartyLabel.toLowerCase()}, ${opts.discountPct}% off, funded by ${secondPartyLabel})`,
  );

  const today = todayDateStr();
  const periodStart = addDaysToDateStr(today, -opts.anchorDaysAgo);
  const periodEnd = addDaysToDateStr(periodStart, 14);
  const lastOrderDay = periodEnd <= today ? periodEnd : today;
  const subtotals = [3200, 2800, 4500, 3600, 5100, 2900, 4200, 3800];
  const totalOrders = opts.orderCount + opts.deliveryOrderCount;
  if (totalOrders === 0) {
    throw new Error('Nothing to seed — set --orders and/or --delivery-orders above 0.');
  }

  const existingSeedOrders =
    opts.clean || opts.resetStoreOrders ? 0 : await countExistingSeedOrders(store.id);
  if (existingSeedOrders > 0) {
    console.log(`➕  Appending ${totalOrders} order(s) to ${existingSeedOrders} existing seed order(s).\n`);
  }

  const orderSpecs = buildOrderSpecs(
    opts.orderCount,
    opts.deliveryOrderCount,
    periodStart,
    lastOrderDay,
    subtotals,
    existingSeedOrders,
    existingSeedOrders,
  );

  console.log(
    `📅  Order dates: ${periodStart} → ${lastOrderDay} (${opts.orderCount} pickup + ${opts.deliveryOrderCount} delivery)\n`,
  );

  let totalDiscount = 0;
  let totalPlatformShare = 0;
  let pickupCreated = 0;
  let deliveryCreated = 0;

  for (const spec of orderSpecs) {
    const result = await createSeedOrder(spec, { store, product, promo, opts });
    totalDiscount += result.totalDiscountAmount;
    totalPlatformShare += result.platformShare;
    if (result.orderMode === 'DELIVERY') deliveryCreated++;
    else pickupCreated++;

    const modeLabel = result.orderMode === 'DELIVERY' ? 'delivery' : 'pickup  ';
    console.log(
      `    ✅  [${modeLabel}] ${result.orderNumber}  ${result.orderDate}  subtotal LKR ${result.subtotal.toFixed(2)}  discount LKR ${result.discount.toFixed(2)}  platform share LKR ${result.platformShare.toFixed(2)}`,
    );
  }

  await prisma.promoCode.update({
    where: { id: promo.id },
    data: { usedCount: { increment: totalOrders } },
  });

  console.log('\n💰  Syncing wallet from PAID online orders…');
  const syncResult = await syncMissingWalletPayments(store.id);
  console.log(
    `    Added ${syncResult.ordersAdded} wallet payment(s); skipped ${syncResult.ordersSkipped}.`,
  );

  const summary = await getWalletSummary(store.id);
  const period15 = await resolvePayoutPeriod(store.id, 15);
  const breakdown = await computeBreakdownForPeriod(store.id, period15.from, period15.to);

  console.log('\n── Summary ─────────────────────────────────────────');
  console.log(`    Wallet available:     LKR ${(summary.availableBalance / 100).toFixed(2)}`);
  console.log(`    Period net (15-day):  LKR ${(breakdown.netAmount / 100).toFixed(2)} (${breakdown.orderCount} orders)`);
  console.log(`    15-day window:        ${period15.from} → ${period15.to}`);
  console.log(
    `    Period complete:      ${period15.capped ? 'NO — capped at today' : 'YES — branch Request Payout enabled'}`,
  );
  console.log(
    `    Orders seeded:        ${pickupCreated} pickup + ${deliveryCreated} delivery`,
  );
  console.log(
    `    SHARED promo usage:   total discount LKR ${totalDiscount.toFixed(2)}, platform share LKR ${totalPlatformShare.toFixed(2)}`,
  );

  if (period15.capped) {
    const completeAfter = addDaysToDateStr(period15.from, 14);
    console.log('\n⚠️   Period still capped. Either:');
    console.log(`       • Wait until ${completeAfter}, or`);
    console.log(`       • Re-run with --anchor-days ${opts.anchorDaysAgo + 5} or --reset-store-orders`);
    console.log('       • Use Super Admin → Initiate Payout (no capped guard on that modal)');
  } else {
    console.log('\n✅   Open branch Wallet → Request Payout to test the flow.');
  }

  const earliest = await prisma.order.findFirst({
    where: { storeId: store.id, paymentStatus: 'PAID' },
    orderBy: { createdAt: 'asc' },
    select: { orderNumber: true, createdAt: true },
  });
  if (earliest && !earliest.orderNumber.startsWith('SPPC-')) {
    console.log(
      `\n⚠️   Earliest PAID order is ${earliest.orderNumber} (${earliest.createdAt.toISOString().slice(0, 10)}), not a seed order.`,
    );
    console.log('    Run with --reset-store-orders if that order blocks your payout period.');
  }

  console.log('\n✅  Seed complete.\n');
}

main()
  .catch((err) => {
    console.error('❌  Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
