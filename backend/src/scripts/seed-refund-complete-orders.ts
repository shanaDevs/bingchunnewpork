/**
 * Seeds 3 cancelled orders for payout Refund adjustments (default: Nugegoda, Aug 11–25):
 *   1. Customer cancel inside the 10-minute window → refund REJECTED
 *      (Rejected refunds column)
 *   2. Customer cancel after the window at PREPARING → refund COMPLETE, partial sales retained
 *      (Customer late cancellations column)
 *   3. Branch accepted then cancelled → refund COMPLETE + gateway penalty
 *      (Branch-initiated cancellations column)
 *
 * Usage:
 *   npm run seed:refund-test -w @bingchun/backend
 *   npm run seed:refund-test -w @bingchun/backend -- --store-name Nugegoda
 */
import crypto from 'crypto';
import { assertDevSeedOnly } from './seedGuard';
assertDevSeedOnly();
import dotenv from 'dotenv';
import path from 'path';
import type { OrderStatus, RefundStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { CUSTOMER_CANCEL_WINDOW_MS } from '../lib/orderCancel';
import { getRefundPercentageForStatus } from '../lib/orderStatusRefundConfig';
import {
  buildRefundPaymentStructure,
  buildRejectedRefundPaymentStructure,
  GATEWAY_PENALTY_LKR,
} from '../lib/refundPaymentStructure';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const SEED_ORDER_ID_PREFIX = 'seed-refund-';

type SeedOptions = {
  storeName: string;
  storeId?: string;
  clean: boolean;
  periodFrom: string;
  periodTo: string;
};

function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  const opts: SeedOptions = {
    storeName: 'Nugegoda',
    clean: true,
    periodFrom: '2026-08-11',
    periodTo: '2026-08-25',
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
      case '--keep':
        opts.clean = false;
        break;
      case '--from':
        if (next) opts.periodFrom = next;
        i++;
        break;
      case '--to':
        if (next) opts.periodTo = next;
        i++;
        break;
      default:
        break;
    }
  }

  return opts;
}

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function money(n: number): string {
  return `LKR ${n.toFixed(2)}`;
}

async function resolveStore(opts: SeedOptions) {
  if (opts.storeId) {
    const store = await prisma.store.findUnique({
      where: { id: opts.storeId },
      select: { id: true, name: true },
    });
    if (!store) throw new Error(`Store not found: ${opts.storeId}`);
    return store;
  }

  const store = await prisma.store.findFirst({
    where: { name: { contains: opts.storeName }, isActive: true },
    select: { id: true, name: true },
  });
  if (!store) {
    throw new Error(`No active store matching "${opts.storeName}". Use --store-name or --store-id.`);
  }
  return store;
}

async function deleteSeedOrders(storeId: string) {
  const seedOrders = await prisma.order.findMany({
    where: { storeId, id: { startsWith: SEED_ORDER_ID_PREFIX } },
    select: { id: true },
  });
  if (seedOrders.length === 0) return 0;

  const orderIds = seedOrders.map((o) => o.id);
  await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.walletTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  return orderIds.length;
}

type ScenarioKey = 'within-window' | 'after-window' | 'branch-accepted';

type ScenarioSpec = {
  key: ScenarioKey;
  label: string;
  guestName: string;
  orderMode: 'TAKEAWAY' | 'DELIVERY';
  dateOffsetDays: number;
  hour: number;
  subtotal: number;
  deliveryFee: number;
  convenientFee: number;
  cancelledBy: string;
  submittedBy: 'CUSTOMER' | 'BRANCH_ADMIN';
  cancellationReason: string;
  customReasonText: string | null;
  cancelledAtStatus: OrderStatus;
  cancelledWithinWindow: boolean;
  refundStatus: RefundStatus;
  cancelOffsetMs: number;
  acceptOffsetMs: number | null;
};

const ORDER_NUMBER_SUFFIX: Record<ScenarioKey, string> = {
  'within-window': 'WITHIN',
  'after-window': 'AFTER',
  'branch-accepted': 'BRANCH',
};

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildScenarios(): ScenarioSpec[] {
  return [
    {
      key: 'within-window',
      label: 'Customer cancel WITHIN window — refund REJECTED',
      guestName: 'Refund Seed — Within Window Rejected',
      orderMode: 'DELIVERY',
      dateOffsetDays: 1,
      hour: 10,
      subtotal: 3200,
      deliveryFee: 250,
      convenientFee: 50,
      cancelledBy: 'customer',
      submittedBy: 'CUSTOMER',
      cancellationReason: 'CHANGED_MIND',
      customReasonText: null,
      cancelledAtStatus: 'RECEIVED',
      cancelledWithinWindow: true,
      refundStatus: 'REJECTED',
      cancelOffsetMs: 4 * 60 * 1000,
      acceptOffsetMs: null,
    },
    {
      key: 'after-window',
      label: 'Customer cancel AFTER window at PREPARING — refund COMPLETE',
      guestName: 'Refund Seed — After Window',
      orderMode: 'DELIVERY',
      dateOffsetDays: 7,
      hour: 12,
      subtotal: 4100,
      deliveryFee: 250,
      convenientFee: 50,
      cancelledBy: 'customer',
      submittedBy: 'CUSTOMER',
      cancellationReason: 'CHANGED_MIND',
      customReasonText: null,
      cancelledAtStatus: 'PREPARING',
      cancelledWithinWindow: false,
      refundStatus: 'COMPLETE',
      cancelOffsetMs: CUSTOMER_CANCEL_WINDOW_MS + 8 * 60 * 1000,
      acceptOffsetMs: 2 * 60 * 1000,
    },
    {
      key: 'branch-accepted',
      label: 'Branch accepted then cancelled',
      guestName: 'Refund Seed — Branch Cancel',
      orderMode: 'DELIVERY',
      dateOffsetDays: 11,
      hour: 15,
      subtotal: 3800,
      deliveryFee: 250,
      convenientFee: 50,
      cancelledBy: 'Nugegoda Branch Manager',
      submittedBy: 'BRANCH_ADMIN',
      cancellationReason: 'OTHER',
      customReasonText: 'Item out of stock / unavailable',
      cancelledAtStatus: 'PREPARING',
      cancelledWithinWindow: false,
      refundStatus: 'COMPLETE',
      cancelOffsetMs: 8 * 60 * 1000,
      acceptOffsetMs: 2 * 60 * 1000,
    },
  ];
}

async function createScenarioOrder(
  spec: ScenarioSpec,
  ctx: {
    store: { id: string; name: string };
    product: { id: string; name: string };
    placedAt: Date;
    adminId: string | null;
  },
) {
  const { store, product, placedAt, adminId } = ctx;
  const storeSlug = store.id.replace(/[^a-z0-9]/gi, '').slice(-10).toLowerCase();
  const orderId = `${SEED_ORDER_ID_PREFIX}${storeSlug}-${spec.key}`;
  const dateTag = placedAt.toISOString().slice(0, 10).replace(/-/g, '');
  const orderNumber = `RFND-${storeSlug.slice(0, 4).toUpperCase()}-${dateTag}-${ORDER_NUMBER_SUFFIX[spec.key]}`;
  const qty = 2;
  const unitPrice = Math.floor(spec.subtotal / qty);
  const total = spec.subtotal + spec.deliveryFee + spec.convenientFee;
  const cancelAt = new Date(placedAt.getTime() + spec.cancelOffsetMs);
  const acceptAt = spec.acceptOffsetMs != null ? new Date(placedAt.getTime() + spec.acceptOffsetMs) : null;
  const processedAt = addMinutes(cancelAt, 20);
  const windowEndsAt = new Date(placedAt.getTime() + CUSTOMER_CANCEL_WINDOW_MS);

  const refundPercentage =
    spec.refundStatus === 'REJECTED'
      ? 0
      : spec.submittedBy === 'BRANCH_ADMIN' || spec.cancelledWithinWindow
        ? 100
        : await getRefundPercentageForStatus(spec.cancelledAtStatus);

  const paymentStructure =
    spec.refundStatus === 'REJECTED'
      ? buildRejectedRefundPaymentStructure({
          salesTotal: spec.subtotal,
          deliveryFee: spec.deliveryFee,
          convenienceFee: spec.convenientFee,
        })
      : buildRefundPaymentStructure({
          submittedBy: spec.submittedBy,
          cancelledWithinWindow: spec.cancelledWithinWindow,
          refundPercentage,
          salesTotal: spec.subtotal,
          deliveryFee: spec.deliveryFee,
          convenienceFee: spec.convenientFee,
          orderTotal: total,
          paymentMethod: 'PAYHERE',
          orderMode: spec.orderMode,
        });

  const refundAmount =
    spec.refundStatus === 'REJECTED'
      ? 0
      : paymentStructure.returningSubtotal +
        paymentStructure.returningDeliveryFee +
        paymentStructure.returningConvenienceFee;

  const cancelNote =
    spec.submittedBy === 'CUSTOMER'
      ? spec.cancelledWithinWindow
        ? spec.refundStatus === 'REJECTED'
          ? 'Cancelled by customer within refund window — refund later rejected'
          : 'Cancelled by customer. Full refund of all paid amount'
        : 'Cancelled by customer after refund window at PREPARING. Partial refund on sales total only'
      : 'Cancelled by Nugegoda Branch Manager after accepting the order';

  const statusEvents: { status: OrderStatus; note: string; createdAt: Date }[] = [
    { status: 'RECEIVED', note: 'Seed order placed and paid', createdAt: placedAt },
  ];
  if (acceptAt) {
    statusEvents.push({
      status: 'PREPARING',
      note: 'Branch accepted the order',
      createdAt: acceptAt,
    });
  }
  statusEvents.push({
    status: 'CANCELLED',
    note: cancelNote,
    createdAt: cancelAt,
  });

  await prisma.order.create({
    data: {
      id: orderId,
      orderNumber,
      storeId: store.id,
      guestName: spec.guestName,
      guestPhone: '94771234567',
      orderMode: spec.orderMode,
      status: 'CANCELLED',
      paymentMethod: 'PAYHERE',
      paymentGateway: 'PAYHERE',
      paymentStatus: spec.refundStatus === 'COMPLETE' ? 'REFUNDED' : 'PAID',
      paymentRef: `seed-ph-${orderId}`,
      prepaidAmount: total,
      subtotal: spec.subtotal,
      deliveryFee: spec.deliveryFee,
      convenientFee: spec.convenientFee,
      discount: 0,
      loyaltyDiscount: 0,
      total,
      cancelReason: spec.submittedBy === 'CUSTOMER' ? 'CUSTOMER_REQUEST' : 'OUT_OF_STOCK',
      cancelledBy: spec.cancelledBy,
      cancelWindowStartsAt: placedAt,
      estimatedMinutes: 35,
      channel: 'WEB',
      notes: `Refund ${spec.refundStatus} seed — ${spec.label}`,
      deliveryAddressLine: '88 High Level Road',
      deliveryCity: 'Nugegoda',
      deliveryDistrict: 'Colombo',
      createdAt: placedAt,
      updatedAt: processedAt,
      items: {
        create: [
          {
            id: crypto.randomUUID(),
            productId: product.id,
            productName: product.name,
            size: 'REGULAR',
            quantity: qty,
            unitPrice,
            totalPrice: spec.subtotal,
          },
        ],
      },
      statusEvents: {
        create: statusEvents,
      },
      refund: {
        create: {
          customerName: spec.guestName,
          submittedBy: spec.submittedBy,
          cancellationReason: spec.cancellationReason,
          customReasonText: spec.customReasonText,
          cancelledWithinWindow: spec.cancelledWithinWindow,
          cancelledAtStatus: spec.cancelledAtStatus,
          configuredStatusRefundPercentage: refundPercentage,
          salesTotal: spec.subtotal,
          deliveryFee: spec.deliveryFee,
          convenienceFee: spec.convenientFee,
          orderTotal: total,
          refundPercentage,
          refundAmount,
          penaltyAmount: spec.submittedBy === 'BRANCH_ADMIN' ? GATEWAY_PENALTY_LKR : null,
          returningSubtotal: paymentStructure.returningSubtotal,
          notReturningSubtotal: paymentStructure.notReturningSubtotal,
          returningDeliveryFee: paymentStructure.returningDeliveryFee,
          returningConvenienceFee: paymentStructure.returningConvenienceFee,
          nonRefundableDeliveryFee: paymentStructure.nonRefundableDeliveryFee,
          nonRefundableConvenienceFee: paymentStructure.nonRefundableConvenienceFee,
          additionalGatewayFee: paymentStructure.additionalGatewayFee,
          status: spec.refundStatus,
          adminNotes:
            spec.refundStatus === 'REJECTED'
              ? 'Seeded rejection: customer cancelled within window but refund was declined'
              : 'Seeded as refund COMPLETE for payout / refund-adjustment testing',
          processedByAdminId: adminId,
          processedAt,
          paidAt: spec.refundStatus === 'COMPLETE' ? processedAt : null,
          createdAt: cancelAt,
          updatedAt: processedAt,
        },
      },
    },
  });

  return {
    orderNumber,
    placedAt,
    cancelAt,
    processedAt,
    windowEndsAt,
    refundAmount,
    refundPercentage,
    paymentStructure,
  };
}

async function main() {
  const opts = parseArgs();
  const store = await resolveStore(opts);

  console.log('🌱  Refund adjustment order seed');
  console.log(`    Store: ${store.name} (${store.id})\n`);

  if (opts.clean) {
    const removed = await deleteSeedOrders(store.id);
    console.log(`🧹  Removed ${removed} previous seed-refund-* order(s).\n`);
  }

  const product = await prisma.product.findFirst({
    where: { isAvailable: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (!product) throw new Error('No available products. Run prisma:seed first.');

  const admin = await prisma.adminUser.findFirst({
    where: {
      OR: [
        { storeId: store.id, email: { contains: 'branch' } },
        { storeId: store.id },
      ],
    },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'asc' },
  });

  const scenarios = buildScenarios();
  if (admin) {
    const branch = scenarios.find((s) => s.key === 'branch-accepted');
    if (branch) branch.cancelledBy = admin.name;
  }

  console.log(`📅  Period: ${opts.periodFrom} → ${opts.periodTo}`);
  console.log(`    Refund window: ${CUSTOMER_CANCEL_WINDOW_MS / 60000} minutes from payment confirmation\n`);

  for (const spec of scenarios) {
    const dateStr = addDaysToDateStr(opts.periodFrom, spec.dateOffsetDays);
    if (dateStr < opts.periodFrom || dateStr > opts.periodTo) {
      throw new Error(`Scenario ${spec.key} date ${dateStr} is outside ${opts.periodFrom}–${opts.periodTo}`);
    }
    const placedAt = new Date(`${dateStr}T${String(spec.hour).padStart(2, '0')}:15:00.000Z`);
    const result = await createScenarioOrder(spec, {
      store,
      product,
      placedAt,
      adminId: admin?.id ?? null,
    });

    const withinLabel = spec.cancelledWithinWindow ? 'YES (full refund)' : 'NO (after window)';
    console.log(`    ✅  ${spec.label}`);
    console.log(`        Order:      ${result.orderNumber}`);
    console.log(`        Placed:     ${result.placedAt.toISOString()}`);
    console.log(`        Window end: ${result.windowEndsAt.toISOString()}`);
    console.log(`        Cancelled:  ${result.cancelAt.toISOString()}  (within window: ${withinLabel})`);
    console.log(`        Refund ${spec.refundStatus} at: ${result.processedAt.toISOString()}`);
    console.log(`        Status at cancel: ${spec.cancelledAtStatus}  ·  cancelledBy: ${spec.cancelledBy}`);
    console.log(
      `        Refund ${spec.refundStatus} ${result.refundPercentage}%  amount ${money(result.refundAmount)}  not-returning ${money(result.paymentStructure.notReturningSubtotal)}  gateway fee ${money(result.paymentStructure.additionalGatewayFee)}`,
    );
    console.log('');
  }

  console.log('── Seeded refunds ──────────────────────────────────');
  const created = await prisma.refund.findMany({
    where: { order: { storeId: store.id, id: { startsWith: SEED_ORDER_ID_PREFIX } } },
    select: {
      status: true,
      submittedBy: true,
      cancelledWithinWindow: true,
      cancelledAtStatus: true,
      refundAmount: true,
      additionalGatewayFee: true,
      notReturningSubtotal: true,
      processedAt: true,
      order: { select: { orderNumber: true, cancelledBy: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const row of created) {
    console.log(
      `    ${row.order.orderNumber}  ${row.status}  processed=${row.processedAt?.toISOString().slice(0, 10)}  ${row.submittedBy}  window=${row.cancelledWithinWindow}  at=${row.cancelledAtStatus}  by=${row.order.cancelledBy}  amount=${row.refundAmount}  notReturning=${row.notReturningSubtotal}`,
    );
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
