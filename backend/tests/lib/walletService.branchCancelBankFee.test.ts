import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: { findMany: vi.fn() },
    store: { findUnique: vi.fn() },
    refund: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/appSchema', () => ({
  getGatewayFeeRate: vi.fn().mockResolvedValue(0.019),
  getConvenienceFeeRates: vi.fn().mockResolvedValue({ takeaway: 0, delivery: 0 }),
}));

vi.mock('../../src/lib/platformPaybackSchema', () => ({
  ensurePlatformPaybackSchema: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../src/lib/prisma';
import {
  computeBreakdownForPeriod,
  computeCancelledByBranchGatewayFee,
} from '../../src/lib/walletService';
import { GATEWAY_PENALTY_LKR } from '../../src/lib/refundPaymentStructure';

const STORE_ID = 'store-bank-fee-1';
const FROM = '2026-09-03';
const TO = '2026-09-09';

const activePaidPickup = {
  total: 1410,
  subtotal: 1410,
  deliveryFee: 0,
  convenientFee: 72,
  discount: 0,
  loyaltyDiscount: 0,
  orderMode: 'TAKEAWAY',
  paymentMethod: 'PAYHERE',
  createdAt: new Date('2026-09-05T10:00:00.000Z'),
  storeId: STORE_ID,
  status: 'RECEIVED',
  promotionUsages: [],
};

const completeBranchRefund = {
  submittedBy: 'BRANCH_ADMIN',
  additionalGatewayFee: GATEWAY_PENALTY_LKR,
  order: { cancelledBy: 'Branch Admin', orderNumber: 'ORD-1', storeId: STORE_ID },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.store.findUnique).mockResolvedValue({
    platformDiscountPaybackEnabled: false,
  } as never);
});

describe('computeCancelledByBranchGatewayFee', () => {
  it('sums LKR 150 per COMPLETE BRANCH_ADMIN refund in the period', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([completeBranchRefund] as never);

    const result = await computeCancelledByBranchGatewayFee(STORE_ID, FROM, TO);

    expect(result.cancelledByBranchGatewayFee).toBe(GATEWAY_PENALTY_LKR * 100);
    expect(result.cancelledByBranchOrderCount).toBe(1);
    expect(prisma.refund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'COMPLETE',
          processedAt: expect.objectContaining({
            gte: new Date(`${FROM}T00:00:00.000Z`),
            lte: new Date(`${TO}T23:59:59.999Z`),
          }),
        }),
      }),
    );
  });

  it('defaults to LKR 150 when additionalGatewayFee is missing on a branch refund', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      {
        submittedBy: 'BRANCH_ADMIN',
        additionalGatewayFee: null,
        order: { cancelledBy: 'Cashier', orderNumber: 'ORD-2', storeId: STORE_ID },
      },
    ] as never);

    const result = await computeCancelledByBranchGatewayFee(STORE_ID, FROM, TO);
    expect(result.cancelledByBranchGatewayFee).toBe(GATEWAY_PENALTY_LKR * 100);
  });
});

describe('computeBreakdownForPeriod — branch cancellation bank fee', () => {
  it('reduces netAmount by LKR 150 when a COMPLETE branch refund penalty is present', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([activePaidPickup] as never);

    // First call: no branch-cancellation refunds → baseline net
    vi.mocked(prisma.refund.findMany).mockResolvedValue([]);
    const withoutPenalty = await computeBreakdownForPeriod(STORE_ID, FROM, TO);

    // Second call: COMPLETE branch refund with bank penalty
    vi.mocked(prisma.refund.findMany).mockImplementation(async (args) => {
      const where = args?.where as { status?: string };
      // Only branch-cancellation COMPLETE query should return the penalty refund.
      // Late-cancel / rejected queries use different status shapes.
      if (where?.status === 'COMPLETE') {
        return [completeBranchRefund] as never;
      }
      return [] as never;
    });
    const withPenalty = await computeBreakdownForPeriod(STORE_ID, FROM, TO);

    expect(withPenalty.cancelledByBranchGatewayFee).toBe(GATEWAY_PENALTY_LKR * 100);
    expect(withPenalty.cancelledByBranchOrderCount).toBe(1);
    expect(withPenalty.netAmount).toBe(
      Math.max(0, withoutPenalty.netAmount - GATEWAY_PENALTY_LKR * 100),
    );
    expect(withoutPenalty.netAmount - withPenalty.netAmount).toBe(GATEWAY_PENALTY_LKR * 100);
  });
});
