import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { getDeliveryPlatformFeeRate, getGatewayFeeRate } from './appSchema';
import {
  computeDeliveryWalletNet,
  isGatewayChargedDeliveryMethod,
  resolveLateCancelDeliveryFee,
} from './deliveryWalletMath';
import { businessDayEndUtc, businessDayStartUtc } from './deliveryPayoutMath';
import { chartBucketKey, type ChartRange } from './dashboardStatsDateRange';

export type DeliveryWalletBranchRow = {
  storeId: string;
  storeName: string;
  fromActiveOrders: number;
  fromLateCancels: number;
  grossDeliveryFee: number;
  orderCount: number;
  lateCancelCount: number;
  platformFee: number;
  afterPlatformFee: number;
  gatewayFee: number;
  netForDelivery: number;
};

export type DeliveryWalletSummary = {
  grossDeliveryFee: number;
  fromActiveOrders: number;
  fromLateCancels: number;
  platformFeeRate: number;
  platformFeePercent: number;
  platformFee: number;
  afterPlatformFee: number;
  gatewayFeeRate: number;
  gatewayFeePercent: number;
  gatewayFee: number;
  netForDelivery: number;
  orderCount: number;
  lateCancelCount: number;
  branches: DeliveryWalletBranchRow[];
};

export { computeDeliveryWalletNet, resolveLateCancelDeliveryFee };

const MAX_WALLET_RANGE_DAYS = 400;

export function maxDeliveryWalletRangeDays(): number {
  return MAX_WALLET_RANGE_DAYS;
}

function createdAtFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: businessDayStartUtc(from) } : {}),
    ...(to ? { lte: businessDayEndUtc(to) } : {}),
  };
}

function processedAtFilter(from?: string, to?: string): Prisma.DateTimeNullableFilter {
  if (!from && !to) return { not: null };
  return {
    ...(from ? { gte: businessDayStartUtc(from) } : {}),
    ...(to ? { lte: businessDayEndUtc(to) } : {}),
  };
}

export function emptyDeliveryWalletSummary(
  platformFeeRate = 0,
  gatewayFeeRate = 0,
): DeliveryWalletSummary {
  return {
    grossDeliveryFee: 0,
    fromActiveOrders: 0,
    fromLateCancels: 0,
    platformFeeRate,
    platformFeePercent: rateToPercent(platformFeeRate),
    platformFee: 0,
    afterPlatformFee: 0,
    gatewayFeeRate,
    gatewayFeePercent: rateToPercent(gatewayFeeRate),
    gatewayFee: 0,
    netForDelivery: 0,
    orderCount: 0,
    lateCancelCount: 0,
    branches: [],
  };
}

function rateToPercent(rate: number): number {
  return Math.round(rate * 1000) / 10;
}

export async function getDeliveryWalletSummary(from?: string, to?: string): Promise<DeliveryWalletSummary> {
  const createdAt = createdAtFilter(from, to);
  const [platformFeeRate, gatewayFeeRate, stores, orderGroups, refunds, rejectedRefunds] =
    await Promise.all([
    getDeliveryPlatformFeeRate(),
    getGatewayFeeRate(),
    prisma.store.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.order.groupBy({
      by: ['storeId', 'paymentMethod'],
      where: {
        orderMode: 'DELIVERY',
        status: { not: 'CANCELLED' },
        paymentStatus: 'PAID',
        deliveryFee: { gt: 0 },
        ...(createdAt ? { createdAt } : {}),
      },
      _sum: { deliveryFee: true },
      _count: { _all: true },
    }),
    prisma.refund.findMany({
      where: {
        status: { in: ['COMPLETE', 'REJECTED'] },
        submittedBy: 'CUSTOMER',
        cancelledWithinWindow: false,
        processedAt: processedAtFilter(from, to),
      },
      select: {
        status: true,
        submittedBy: true,
        cancelledWithinWindow: true,
        nonRefundableDeliveryFee: true,
        deliveryFee: true,
        convenienceFee: true,
        salesTotal: true,
        orderTotal: true,
        refundPercentage: true,
        order: {
          select: {
            storeId: true,
            paymentMethod: true,
            orderMode: true,
          },
        },
      },
    }),
    // Rejected refunds (within-window customer + branch-admin) — same exclusion as walletService.
    prisma.refund.findMany({
      where: {
        status: 'REJECTED',
        processedAt: processedAtFilter(from, to),
        nonRefundableDeliveryFee: { gt: 0 },
        NOT: {
          AND: [{ submittedBy: 'CUSTOMER' }, { cancelledWithinWindow: false }],
        },
        order: {
          status: 'CANCELLED',
        },
      },
      select: {
        nonRefundableDeliveryFee: true,
        order: {
          select: {
            storeId: true,
            paymentMethod: true,
          },
        },
      },
    }),
  ]);

  type StoreFee = { amount: number; cardAmount: number; count: number };
  const emptyFee = (): StoreFee => ({ amount: 0, cardAmount: 0, count: 0 });

  const activeByStore = new Map<string, StoreFee>();
  for (const row of orderGroups) {
    const prev = activeByStore.get(row.storeId) ?? emptyFee();
    const amount = row._sum.deliveryFee ?? 0;
    const cardAmount = isGatewayChargedDeliveryMethod(row.paymentMethod) ? amount : 0;
    activeByStore.set(row.storeId, {
      amount: prev.amount + amount,
      cardAmount: prev.cardAmount + cardAmount,
      count: prev.count + row._count._all,
    });
  }

  const lateByStore = new Map<string, StoreFee>();
  for (const refund of refunds) {
    const fee = resolveLateCancelDeliveryFee(refund);
    if (fee <= 0) continue;
    const storeId = refund.order.storeId;
    const prev = lateByStore.get(storeId) ?? emptyFee();
    const cardAmount = isGatewayChargedDeliveryMethod(refund.order.paymentMethod) ? fee : 0;
    lateByStore.set(storeId, {
      amount: prev.amount + fee,
      cardAmount: prev.cardAmount + cardAmount,
      count: prev.count + 1,
    });
  }
  for (const refund of rejectedRefunds) {
    const fee = Math.max(0, refund.nonRefundableDeliveryFee ?? 0);
    if (fee <= 0) continue;
    const storeId = refund.order.storeId;
    const prev = lateByStore.get(storeId) ?? emptyFee();
    const cardAmount = isGatewayChargedDeliveryMethod(refund.order.paymentMethod) ? fee : 0;
    lateByStore.set(storeId, {
      amount: prev.amount + fee,
      cardAmount: prev.cardAmount + cardAmount,
      count: prev.count + 1,
    });
  }

  const branches: DeliveryWalletBranchRow[] = stores.map((store) => {
    const active = activeByStore.get(store.id) ?? emptyFee();
    const late = lateByStore.get(store.id) ?? emptyFee();
    const grossDeliveryFee = active.amount + late.amount;
    const net = computeDeliveryWalletNet({
      grossDeliveryFee,
      cardGrossDeliveryFee: active.cardAmount + late.cardAmount,
      platformFeeRate,
      gatewayFeeRate,
    });
    return {
      storeId: store.id,
      storeName: store.name,
      fromActiveOrders: active.amount,
      fromLateCancels: late.amount,
      grossDeliveryFee,
      orderCount: active.count,
      lateCancelCount: late.count,
      ...net,
    };
  });

  const fromActiveOrders = branches.reduce((sum, row) => sum + row.fromActiveOrders, 0);
  const fromLateCancels = branches.reduce((sum, row) => sum + row.fromLateCancels, 0);
  const orderCount = branches.reduce((sum, row) => sum + row.orderCount, 0);
  const lateCancelCount = branches.reduce((sum, row) => sum + row.lateCancelCount, 0);
  const grossDeliveryFee = fromActiveOrders + fromLateCancels;
  const cardGrossDeliveryFee = stores.reduce((sum, store) => {
    const active = activeByStore.get(store.id) ?? emptyFee();
    const late = lateByStore.get(store.id) ?? emptyFee();
    return sum + active.cardAmount + late.cardAmount;
  }, 0);
  const totals = computeDeliveryWalletNet({
    grossDeliveryFee,
    cardGrossDeliveryFee,
    platformFeeRate,
    gatewayFeeRate,
  });

  return {
    grossDeliveryFee,
    fromActiveOrders,
    fromLateCancels,
    platformFeeRate,
    platformFeePercent: rateToPercent(platformFeeRate),
    platformFee: totals.platformFee,
    afterPlatformFee: totals.afterPlatformFee,
    gatewayFeeRate,
    gatewayFeePercent: rateToPercent(gatewayFeeRate),
    gatewayFee: totals.gatewayFee,
    netForDelivery: totals.netForDelivery,
    orderCount,
    lateCancelCount,
    branches,
  };
}

type StoreFee = { amount: number; cardAmount: number; count: number };

function emptyStoreFee(): StoreFee {
  return { amount: 0, cardAmount: 0, count: 0 };
}

function addStoreFee(map: Map<string, StoreFee>, storeId: string, amount: number, cardAmount: number, count: number) {
  const prev = map.get(storeId) ?? emptyStoreFee();
  map.set(storeId, {
    amount: prev.amount + amount,
    cardAmount: prev.cardAmount + cardAmount,
    count: prev.count + count,
  });
}

function netForDeliveryFromFees(
  activeByStore: Map<string, StoreFee>,
  lateByStore: Map<string, StoreFee>,
  platformFeeRate: number,
  gatewayFeeRate: number,
): number {
  let grossDeliveryFee = 0;
  let cardGrossDeliveryFee = 0;
  const storeIds = new Set([...activeByStore.keys(), ...lateByStore.keys()]);
  for (const storeId of storeIds) {
    const active = activeByStore.get(storeId) ?? emptyStoreFee();
    const late = lateByStore.get(storeId) ?? emptyStoreFee();
    grossDeliveryFee += active.amount + late.amount;
    cardGrossDeliveryFee += active.cardAmount + late.cardAmount;
  }
  return computeDeliveryWalletNet({
    grossDeliveryFee,
    cardGrossDeliveryFee,
    platformFeeRate,
    gatewayFeeRate,
  }).netForDelivery;
}

/**
 * Delivery-partner outflow per chart bucket from one order + refund load.
 * Does not enumerate every store when a bucket has no activity.
 */
export async function getDeliveryWalletNetByBucket(
  monthlyChart: ChartRange,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const buckets = new Map<string, number>();
  for (const key of monthlyChart.keys) {
    buckets.set(key, 0);
  }

  const createdAt = createdAtFilter(from, to);
  const [platformFeeRate, gatewayFeeRate, orders, refunds, rejectedRefunds] = await Promise.all([
    getDeliveryPlatformFeeRate(),
    getGatewayFeeRate(),
    prisma.order.findMany({
      where: {
        orderMode: 'DELIVERY',
        status: { not: 'CANCELLED' },
        paymentStatus: 'PAID',
        deliveryFee: { gt: 0 },
        ...(createdAt ? { createdAt } : {}),
      },
      select: {
        storeId: true,
        paymentMethod: true,
        deliveryFee: true,
        createdAt: true,
      },
    }),
    prisma.refund.findMany({
      where: {
        status: { in: ['COMPLETE', 'REJECTED'] },
        submittedBy: 'CUSTOMER',
        cancelledWithinWindow: false,
        processedAt: processedAtFilter(from, to),
      },
      select: {
        status: true,
        submittedBy: true,
        cancelledWithinWindow: true,
        nonRefundableDeliveryFee: true,
        deliveryFee: true,
        convenienceFee: true,
        salesTotal: true,
        orderTotal: true,
        refundPercentage: true,
        processedAt: true,
        order: {
          select: {
            storeId: true,
            paymentMethod: true,
            orderMode: true,
          },
        },
      },
    }),
    prisma.refund.findMany({
      where: {
        status: 'REJECTED',
        processedAt: processedAtFilter(from, to),
        nonRefundableDeliveryFee: { gt: 0 },
        NOT: {
          AND: [{ submittedBy: 'CUSTOMER' }, { cancelledWithinWindow: false }],
        },
        order: {
          status: 'CANCELLED',
        },
      },
      select: {
        nonRefundableDeliveryFee: true,
        processedAt: true,
        order: {
          select: {
            storeId: true,
            paymentMethod: true,
          },
        },
      },
    }),
  ]);

  const activeByBucket = new Map<string, Map<string, StoreFee>>();
  for (const order of orders) {
    const key = chartBucketKey(order.createdAt, monthlyChart.granularity);
    if (!buckets.has(key)) continue;
    const byStore = activeByBucket.get(key) ?? new Map<string, StoreFee>();
    const amount = order.deliveryFee ?? 0;
    const cardAmount = isGatewayChargedDeliveryMethod(order.paymentMethod) ? amount : 0;
    addStoreFee(byStore, order.storeId, amount, cardAmount, 1);
    activeByBucket.set(key, byStore);
  }

  const lateByBucket = new Map<string, Map<string, StoreFee>>();
  for (const refund of refunds) {
    if (!refund.processedAt) continue;
    const key = chartBucketKey(refund.processedAt, monthlyChart.granularity);
    if (!buckets.has(key)) continue;
    const fee = resolveLateCancelDeliveryFee(refund);
    if (fee <= 0) continue;
    const byStore = lateByBucket.get(key) ?? new Map<string, StoreFee>();
    const cardAmount = isGatewayChargedDeliveryMethod(refund.order.paymentMethod) ? fee : 0;
    addStoreFee(byStore, refund.order.storeId, fee, cardAmount, 1);
    lateByBucket.set(key, byStore);
  }
  for (const refund of rejectedRefunds) {
    if (!refund.processedAt) continue;
    const key = chartBucketKey(refund.processedAt, monthlyChart.granularity);
    if (!buckets.has(key)) continue;
    const fee = Math.max(0, refund.nonRefundableDeliveryFee ?? 0);
    if (fee <= 0) continue;
    const byStore = lateByBucket.get(key) ?? new Map<string, StoreFee>();
    const cardAmount = isGatewayChargedDeliveryMethod(refund.order.paymentMethod) ? fee : 0;
    addStoreFee(byStore, refund.order.storeId, fee, cardAmount, 1);
    lateByBucket.set(key, byStore);
  }

  for (const key of monthlyChart.keys) {
    buckets.set(
      key,
      netForDeliveryFromFees(
        activeByBucket.get(key) ?? new Map(),
        lateByBucket.get(key) ?? new Map(),
        platformFeeRate,
        gatewayFeeRate,
      ),
    );
  }

  return buckets;
}
