import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    store: { findUnique: vi.fn() },
    refund: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/appSchema', () => ({
  getGatewayFeeRate: vi.fn().mockResolvedValue(0.019),
  getConvenienceFeeRates: vi.fn().mockResolvedValue({ pickup: 0.06, delivery: 0.075 }),
}));

vi.mock('../../src/lib/platformPaybackSchema', () => ({
  ensurePlatformPaybackSchema: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../src/lib/prisma';
import {
  EMPTY_REFUND_PENALTY_PREFETCH,
  computeBreakdownForPeriodOrders,
  loadRefundPenaltyTotalsByStore,
} from '../../src/lib/walletService';
import { GATEWAY_PENALTY_LKR } from '../../src/lib/refundPaymentStructure';

describe('computeBreakdownForPeriodOrders refund prefetch', () => {
  beforeEach(() => {
    vi.mocked(prisma.refund.findMany).mockReset();
    vi.mocked(prisma.store.findUnique).mockReset();
  });

  it('does not query refunds when prefetch supplies penalty totals', async () => {
    const result = await computeBreakdownForPeriodOrders(
      'store-1',
      [],
      '2026-09-01',
      '2026-09-22',
      {
        gatewayFeeRate: 0.019,
        storePaybackEnabled: false,
        refundPenalty: {
          ...EMPTY_REFUND_PENALTY_PREFETCH,
          cancelledByBranchGatewayFee: 15000,
          cancelledByBranchOrderCount: 1,
        },
      },
    );

    expect(prisma.refund.findMany).not.toHaveBeenCalled();
    expect(prisma.store.findUnique).not.toHaveBeenCalled();
    expect(result.cancelledByBranchGatewayFee).toBe(15000);
    expect(result.commissionFee).toBe(0);
    expect(result.gatewayFee).toBe(0);
  });

  it('counts card and loyalty delivery item revenue in the online wallet and gateway base', async () => {
    const createdAt = new Date('2026-08-23T00:00:00.000Z');
    const order = (
      fields: Partial<{
        subtotal: number;
        total: number;
        deliveryFee: number | null;
        convenientFee: number | null;
        orderMode: string;
        paymentMethod: string;
      }>,
    ) => ({
      subtotal: 0,
      total: 0,
      deliveryFee: null,
      convenientFee: null,
      discount: 0,
      loyaltyDiscount: 0,
      orderMode: 'TAKEAWAY',
      paymentMethod: 'CASH_AT_COUNTER',
      createdAt,
      storeId: 'store-1',
      status: 'COMPLETED',
      promotionUsages: [],
      ...fields,
    });

    const result = await computeBreakdownForPeriodOrders(
      'store-1',
      [
        order({ subtotal: 1400, total: 1400, orderMode: 'TAKEAWAY', paymentMethod: 'CASH_AT_COUNTER' }),
        order({
          subtotal: 2200,
          total: 2680,
          deliveryFee: 400,
          convenientFee: 80,
          orderMode: 'DELIVERY',
          paymentMethod: 'CARD',
        }),
        order({
          subtotal: 500,
          total: 500,
          deliveryFee: 0,
          convenientFee: 0,
          orderMode: 'DELIVERY',
          paymentMethod: 'LOYALTY_POINTS',
        }),
        order({
          subtotal: 1000,
          total: 1050,
          convenientFee: 50,
          orderMode: 'TAKEAWAY',
          paymentMethod: 'PAYHERE',
        }),
      ],
      '2026-08-23',
      '2026-09-06',
      {
        gatewayFeeRate: 0.019,
        storePaybackEnabled: false,
        refundPenalty: EMPTY_REFUND_PENALTY_PREFETCH,
      },
    );

    const onlineItemCents = (2200 + 500 + 1000) * 100;
    expect(result.grossAmount).toBe((1400 + 2200 + 500 + 1000) * 100);
    expect(result.onlineWalletGross).toBe(onlineItemCents);
    expect(result.onlinePaymentsCollected).toBe(onlineItemCents);
    expect(result.gatewayBase).toBe(onlineItemCents);
    expect(result.gatewayFee).toBe(Math.round(onlineItemCents * 0.019));
    expect(result.deliveryFee).toBe(400 * 100);
    expect(result.convenienceFee).toBe((80 + 50) * 100);
  });
});

describe('loadRefundPenaltyTotalsByStore', () => {
  beforeEach(() => {
    vi.mocked(prisma.refund.findMany).mockReset();
  });

  it('loads all stores in three queries and groups branch cancellation fees', async () => {
    vi.mocked(prisma.refund.findMany).mockImplementation(async (args) => {
      const where = args?.where as { status?: unknown };
      if (where.status === 'COMPLETE') {
        return [
          {
            submittedBy: 'BRANCH_ADMIN',
            additionalGatewayFee: GATEWAY_PENALTY_LKR,
            order: { storeId: 'store-a', cancelledBy: 'Branch Admin' },
          },
        ] as never;
      }
      return [] as never;
    });

    const byStore = await loadRefundPenaltyTotalsByStore('2026-09-01', '2026-09-22', 0.019);

    expect(prisma.refund.findMany).toHaveBeenCalledTimes(3);
    expect(byStore.get('store-a')?.cancelledByBranchGatewayFee).toBe(
      Math.round(GATEWAY_PENALTY_LKR * 100),
    );
  });
});
