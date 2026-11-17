import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    store: { findMany: vi.fn() },
    order: { groupBy: vi.fn() },
    refund: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/appSchema', () => ({
  getDeliveryPlatformFeeRate: vi.fn().mockResolvedValue(0.08),
  getGatewayFeeRate: vi.fn().mockResolvedValue(0.019),
}));

import { prisma } from '../../src/lib/prisma';
import { getDeliveryWalletSummary } from '../../src/lib/deliveryWalletService';

describe('getDeliveryWalletSummary delivery fee buckets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-1', name: 'Nugegoda' },
    ] as never);
  });

  it('requires cancelled delivery orders for late-cancel retained fees', async () => {
    vi.mocked(prisma.order.groupBy).mockResolvedValue([
      {
        storeId: 'store-1',
        paymentMethod: 'CASH',
        _sum: { deliveryFee: 150 },
        _count: { _all: 1 },
      },
    ] as never);
    vi.mocked(prisma.refund.findMany).mockResolvedValue([] as never);

    const summary = await getDeliveryWalletSummary('2026-10-01', '2026-10-30');

    expect(summary.grossDeliveryFee).toBe(150);
    expect(summary.fromActiveOrders).toBe(150);
    expect(summary.fromLateCancels).toBe(0);

    const lateCancelWhere = vi.mocked(prisma.refund.findMany).mock.calls[0]?.[0]?.where as {
      order?: { status?: string; orderMode?: string };
    };
    expect(lateCancelWhere.order).toEqual({ orderMode: 'DELIVERY', status: 'CANCELLED' });
  });

  it('counts cancelled late-cancel retained fees once, not on top of a live order', async () => {
    vi.mocked(prisma.order.groupBy).mockResolvedValue([
      {
        storeId: 'store-1',
        paymentMethod: 'CASH',
        _sum: { deliveryFee: 150 },
        _count: { _all: 1 },
      },
    ] as never);
    vi.mocked(prisma.refund.findMany)
      .mockResolvedValueOnce([
        {
          status: 'COMPLETE',
          submittedBy: 'CUSTOMER',
          cancelledWithinWindow: false,
          nonRefundableDeliveryFee: 80,
          deliveryFee: 80,
          convenienceFee: 0,
          salesTotal: 0,
          orderTotal: 80,
          refundPercentage: 0,
          order: { storeId: 'store-1', paymentMethod: 'CASH', orderMode: 'DELIVERY' },
        },
      ] as never)
      .mockResolvedValueOnce([] as never);

    const summary = await getDeliveryWalletSummary('2026-10-01', '2026-10-30');

    expect(summary.fromActiveOrders).toBe(150);
    expect(summary.fromLateCancels).toBe(80);
    expect(summary.grossDeliveryFee).toBe(230);
  });
});
