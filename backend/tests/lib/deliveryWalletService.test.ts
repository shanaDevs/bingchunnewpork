import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeDeliveryWalletNet,
  resolveLateCancelDeliveryFee,
} from '../../src/lib/deliveryWalletMath';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    store: { findMany: vi.fn() },
    order: { groupBy: vi.fn(), findMany: vi.fn() },
    refund: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/appSchema', () => ({
  getDeliveryPlatformFeeRate: vi.fn().mockResolvedValue(0.1),
  getGatewayFeeRate: vi.fn().mockResolvedValue(0.019),
}));

import { prisma } from '../../src/lib/prisma';
import {
  getDeliveryWalletNetByBucket,
  getDeliveryWalletSummary,
} from '../../src/lib/deliveryWalletService';

type RefundWhere = Record<string, unknown>;

function isRejectedDeliveryRefundWhere(where: RefundWhere): boolean {
  return (
    where.status === 'REJECTED' &&
    where.NOT != null &&
    where.nonRefundableDeliveryFee != null
  );
}

function isLateCancelRefundWhere(where: RefundWhere): boolean {
  return (
    where.submittedBy === 'CUSTOMER' &&
    where.cancelledWithinWindow === false &&
    (where.status as { in?: string[] })?.in != null
  );
}

describe('computeDeliveryWalletNet', () => {
  it('subtracts platform fee first, then gateway fee on the remaining amount', () => {
    const result = computeDeliveryWalletNet({
      grossDeliveryFee: 1000,
      platformFeeRate: 0.1,
      gatewayFeeRate: 0.019,
    });

    expect(result.platformFee).toBe(100);
    expect(result.afterPlatformFee).toBe(900);
    expect(result.gatewayFee).toBe(17.1);
    expect(result.netForDelivery).toBe(882.9);
  });

  it('does not charge gateway fee on cash-only gross', () => {
    const result = computeDeliveryWalletNet({
      grossDeliveryFee: 1000,
      cardGrossDeliveryFee: 0,
      platformFeeRate: 0.1,
      gatewayFeeRate: 0.019,
    });
    expect(result.platformFee).toBe(100);
    expect(result.afterPlatformFee).toBe(900);
    expect(result.gatewayFee).toBe(0);
    expect(result.netForDelivery).toBe(900);
  });

  it('returns zeros when gross is 0', () => {
    expect(
      computeDeliveryWalletNet({
        grossDeliveryFee: 0,
        platformFeeRate: 0.1,
        gatewayFeeRate: 0.019,
      }),
    ).toEqual({
      platformFee: 0,
      afterPlatformFee: 0,
      gatewayFee: 0,
      netForDelivery: 0,
    });
  });

  it('skips platform cut when rate is 0', () => {
    const result = computeDeliveryWalletNet({
      grossDeliveryFee: 1000,
      platformFeeRate: 0,
      gatewayFeeRate: 0.019,
    });
    expect(result.platformFee).toBe(0);
    expect(result.afterPlatformFee).toBe(1000);
    expect(result.gatewayFee).toBe(19);
    expect(result.netForDelivery).toBe(981);
  });
});

describe('resolveLateCancelDeliveryFee', () => {
  const afterWindow = {
    submittedBy: 'CUSTOMER' as const,
    cancelledWithinWindow: false,
    deliveryFee: 150,
    convenienceFee: 330,
    salesTotal: 4400,
    orderTotal: 4880,
    refundPercentage: 60,
    order: { paymentMethod: 'PAYHERE', orderMode: 'DELIVERY' },
  };

  it('uses stored nonRefundableDeliveryFee for COMPLETE refunds', () => {
    expect(
      resolveLateCancelDeliveryFee({
        ...afterWindow,
        status: 'COMPLETE',
        nonRefundableDeliveryFee: 150,
      }),
    ).toBe(150);
  });

  it('uses stored nonRefundableDeliveryFee for REJECTED refunds', () => {
    expect(
      resolveLateCancelDeliveryFee({
        ...afterWindow,
        status: 'REJECTED',
        nonRefundableDeliveryFee: 150,
      }),
    ).toBe(150);
  });

  it('computes unrefundable delivery fee for REJECTED after-window refunds', () => {
    expect(
      resolveLateCancelDeliveryFee({
        ...afterWindow,
        status: 'REJECTED',
        nonRefundableDeliveryFee: null,
      }),
    ).toBe(150);
  });

  it('returns 0 for RECEIVED refunds', () => {
    expect(
      resolveLateCancelDeliveryFee({
        ...afterWindow,
        status: 'RECEIVED',
        nonRefundableDeliveryFee: null,
      }),
    ).toBe(0);
  });

  it('returns 0 for within-window customer cancels', () => {
    expect(
      resolveLateCancelDeliveryFee({
        ...afterWindow,
        status: 'COMPLETE',
        cancelledWithinWindow: true,
        nonRefundableDeliveryFee: 0,
      }),
    ).toBe(0);
  });

  it('returns 0 for branch/cashier cancels', () => {
    expect(
      resolveLateCancelDeliveryFee({
        ...afterWindow,
        status: 'COMPLETE',
        submittedBy: 'BRANCH_ADMIN',
        nonRefundableDeliveryFee: 0,
      }),
    ).toBe(0);
  });
});

describe('getDeliveryWalletSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-1', name: 'Test Branch' },
    ] as never);
    vi.mocked(prisma.order.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.refund.findMany).mockResolvedValue([] as never);
  });

  it('merges within-window rejected nonRefundableDeliveryFee into fromLateCancels', async () => {
    vi.mocked(prisma.refund.findMany).mockImplementation(async (args) => {
      const where = args?.where as RefundWhere;
      if (isRejectedDeliveryRefundWhere(where)) {
        return [
          {
            nonRefundableDeliveryFee: 150,
            order: { storeId: 'store-1' },
          },
        ] as never;
      }
      return [] as never;
    });

    const summary = await getDeliveryWalletSummary('2026-01-01', '2026-01-31');

    expect(summary.fromLateCancels).toBe(150);
    expect(summary.lateCancelCount).toBe(1);
    expect(summary.branches[0]?.fromLateCancels).toBe(150);
    expect(summary.branches[0]?.lateCancelCount).toBe(1);

    const rejectedCalls = vi
      .mocked(prisma.refund.findMany)
      .mock.calls.filter(([args]) => isRejectedDeliveryRefundWhere(args?.where as RefundWhere));
    expect(rejectedCalls).toHaveLength(1);
    expect(rejectedCalls[0]?.[0]?.where).toEqual(
      expect.objectContaining({
        status: 'REJECTED',
        NOT: {
          AND: [{ submittedBy: 'CUSTOMER' }, { cancelledWithinWindow: false }],
        },
        order: { status: 'CANCELLED' },
      }),
    );
  });

  it('does not double-count customer late-cancel delivery fees in rejected query', async () => {
    vi.mocked(prisma.refund.findMany).mockImplementation(async (args) => {
      const where = args?.where as RefundWhere;
      if (isLateCancelRefundWhere(where)) {
        return [
          {
            status: 'REJECTED',
            submittedBy: 'CUSTOMER',
            cancelledWithinWindow: false,
            nonRefundableDeliveryFee: 200,
            deliveryFee: 200,
            convenienceFee: 33,
            salesTotal: 5000,
            orderTotal: 5233,
            refundPercentage: 60,
            order: {
              storeId: 'store-1',
              paymentMethod: 'PAYHERE',
              orderMode: 'DELIVERY',
            },
          },
        ] as never;
      }
      return [] as never;
    });

    const summary = await getDeliveryWalletSummary('2026-01-01', '2026-01-31');

    expect(summary.fromLateCancels).toBe(200);
    expect(summary.lateCancelCount).toBe(1);

    const rejectedCalls = vi
      .mocked(prisma.refund.findMany)
      .mock.calls.filter(([args]) => isRejectedDeliveryRefundWhere(args?.where as RefundWhere));
    expect(rejectedCalls).toHaveLength(1);
    expect(rejectedCalls[0]?.[0]?.where?.NOT).toEqual({
      AND: [{ submittedBy: 'CUSTOMER' }, { cancelledWithinWindow: false }],
    });
  });

  it('counts only PAID delivery orders in gross', async () => {
    await getDeliveryWalletSummary('2026-01-01', '2026-01-31');
    expect(prisma.order.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderMode: 'DELIVERY',
          paymentStatus: 'PAID',
        }),
      }),
    );
  });

  it('does not apply gateway fee to cash delivery fees', async () => {
    vi.mocked(prisma.order.groupBy).mockResolvedValue([
      {
        storeId: 'store-1',
        paymentMethod: 'CASH_ON_DELIVERY',
        _sum: { deliveryFee: 1000 },
        _count: { _all: 1 },
      },
    ] as never);

    const summary = await getDeliveryWalletSummary('2026-01-01', '2026-01-31');
    expect(summary.grossDeliveryFee).toBe(1000);
    expect(summary.platformFee).toBe(100);
    expect(summary.gatewayFee).toBe(0);
    expect(summary.netForDelivery).toBe(900);
  });

  it('keeps two-decimal gateway and net amounts instead of rounding to integers', async () => {
    vi.mocked(prisma.order.groupBy).mockResolvedValue([
      {
        storeId: 'store-1',
        paymentMethod: 'CARD',
        _sum: { deliveryFee: 1000 },
        _count: { _all: 1 },
      },
    ] as never);

    const summary = await getDeliveryWalletSummary('2026-01-01', '2026-01-31');
    expect(summary.platformFee).toBe(100);
    expect(summary.afterPlatformFee).toBe(900);
    expect(summary.gatewayFee).toBe(17.1);
    expect(summary.netForDelivery).toBe(882.9);
  });
});

describe('getDeliveryWalletNetByBucket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.refund.findMany).mockResolvedValue([] as never);
  });

  it('returns zeros for empty activity without enumerating stores', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.refund.findMany).mockResolvedValue([] as never);

    const monthlyChart = {
      gte: new Date(2026, 1, 1),
      lte: new Date(2026, 6, 15),
      keys: ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'],
      granularity: 'month' as const,
    };

    const buckets = await getDeliveryWalletNetByBucket(monthlyChart, '2026-02-01', '2026-07-15');
    expect([...buckets.values()]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(prisma.store.findMany).not.toHaveBeenCalled();
  });

  it('assigns delivery net to the order createdAt bucket', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        storeId: 'store-1',
        paymentMethod: 'CASH_AT_COUNTER',
        deliveryFee: 1000,
        createdAt: new Date(2026, 6, 10),
      },
    ] as never);
    vi.mocked(prisma.refund.findMany).mockResolvedValue([] as never);

    const monthlyChart = {
      gte: new Date(2026, 5, 1),
      lte: new Date(2026, 6, 15),
      keys: ['2026-06', '2026-07'],
      granularity: 'month' as const,
    };

    const buckets = await getDeliveryWalletNetByBucket(monthlyChart, '2026-06-01', '2026-07-15');
    expect(buckets.get('2026-06')).toBe(0);
    expect(buckets.get('2026-07')).toBe(900);
  });
});
