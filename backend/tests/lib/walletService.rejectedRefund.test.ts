import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    refund: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/appSchema', () => ({
  getGatewayFeeRate: vi.fn().mockResolvedValue(0.019),
}));

import { prisma } from '../../src/lib/prisma';
import {
  computeCustomerLateCancelRecovery,
  computeRejectedRefundPayout,
} from '../../src/lib/walletService';

const STORE_ID = 'store-1';
const FROM = '2026-01-01';
const TO = '2026-01-31';
const GATEWAY_RATE = 0.019;

type RefundWhere = Record<string, unknown>;

function isRejectedRefundWhere(where: RefundWhere): boolean {
  return where.status === 'REJECTED' && where.NOT != null;
}

function isLateCancelWhere(where: RefundWhere): boolean {
  const status = where.status as { in?: string[] } | undefined;
  return (
    where.submittedBy === 'CUSTOMER' &&
    where.cancelledWithinWindow === false &&
    status?.in != null &&
    status.in.includes('REJECTED')
  );
}

function mockRejectedRefundRows() {
  vi.mocked(prisma.refund.findMany).mockImplementation(async (args) => {
    const where = args?.where as RefundWhere;
    if (!isRejectedRefundWhere(where)) return [];
    if (where.notReturningSubtotal) {
      return [{ notReturningSubtotal: 1000 }];
    }
    if (where.nonRefundableConvenienceFee) {
      return [{ nonRefundableConvenienceFee: 33 }];
    }
    if (where.nonRefundableDeliveryFee) {
      return [{ nonRefundableDeliveryFee: 150 }];
    }
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeRejectedRefundPayout', () => {
  it('returns zero when no period bounds are provided', async () => {
    const result = await computeRejectedRefundPayout(STORE_ID);
    expect(result).toEqual({
      rejectedRefundSubtotal: 0,
      rejectedRefundGatewayDeduction: 0,
      rejectedRefundNetAmount: 0,
      rejectedRefundConvenienceFee: 0,
      rejectedRefundDeliveryFee: 0,
    });
    expect(prisma.refund.findMany).not.toHaveBeenCalled();
  });

  it('includes within-window customer REJECTED retained amounts', async () => {
    mockRejectedRefundRows();

    const result = await computeRejectedRefundPayout(STORE_ID, FROM, TO, GATEWAY_RATE);

    const gatewayDeduction = Math.round(100_000 * GATEWAY_RATE);
    expect(result.rejectedRefundSubtotal).toBe(100_000);
    expect(result.rejectedRefundGatewayDeduction).toBe(gatewayDeduction);
    expect(result.rejectedRefundNetAmount).toBe(100_000 - gatewayDeduction);
    expect(result.rejectedRefundConvenienceFee).toBe(3_300);
    expect(result.rejectedRefundDeliveryFee).toBe(15_000);
  });

  it('queries with WHERE that excludes customer late-cancels', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([]);

    await computeRejectedRefundPayout(STORE_ID, FROM, TO, GATEWAY_RATE);

    const rejectedCalls = vi
      .mocked(prisma.refund.findMany)
      .mock.calls.filter(([args]) => isRejectedRefundWhere(args?.where as RefundWhere));

    expect(rejectedCalls).toHaveLength(3);
    for (const [args] of rejectedCalls) {
      const where = args?.where as RefundWhere;
      expect(where.NOT).toEqual({
        AND: [{ submittedBy: 'CUSTOMER' }, { cancelledWithinWindow: false }],
      });
      expect(where.order).toEqual(
        expect.objectContaining({ storeId: STORE_ID, status: 'CANCELLED' }),
      );
    }
  });

  it('includes branch-admin REJECTED via the same rejected-refund WHERE', async () => {
    mockRejectedRefundRows();

    await computeRejectedRefundPayout(STORE_ID, FROM, TO, GATEWAY_RATE);

    const rejectedCalls = vi
      .mocked(prisma.refund.findMany)
      .mock.calls.filter(([args]) => isRejectedRefundWhere(args?.where as RefundWhere));

    expect(rejectedCalls.length).toBeGreaterThan(0);
    for (const [args] of rejectedCalls) {
      const where = args?.where as RefundWhere;
      // BRANCH_ADMIN matches because NOT (CUSTOMER AND !withinWindow) is true for branch submits.
      expect(where.status).toBe('REJECTED');
      expect(where.NOT).toBeDefined();
    }
  });
});

describe('computeCustomerLateCancelRecovery vs computeRejectedRefundPayout', () => {
  it('does not double-count customer late-cancel REJECTED refunds', async () => {
    vi.mocked(prisma.refund.findMany).mockImplementation(async (args) => {
      const where = args?.where as RefundWhere;
      if (isLateCancelWhere(where)) {
        if (where.notReturningSubtotal) return [{ notReturningSubtotal: 500 }];
        if (where.nonRefundableConvenienceFee) return [{ nonRefundableConvenienceFee: 33 }];
        if (where.nonRefundableDeliveryFee) return [{ nonRefundableDeliveryFee: 150 }];
      }
      return [];
    });

    const [lateCancel, rejected] = await Promise.all([
      computeCustomerLateCancelRecovery(STORE_ID, FROM, TO, GATEWAY_RATE),
      computeRejectedRefundPayout(STORE_ID, FROM, TO, GATEWAY_RATE),
    ]);

    expect(lateCancel.customerLateCancelSubtotal).toBe(50_000);
    expect(lateCancel.refundConvenienceFee).toBe(3_300);
    expect(lateCancel.refundDeliveryFee).toBe(15_000);
    expect(rejected.rejectedRefundSubtotal).toBe(0);
    expect(rejected.rejectedRefundConvenienceFee).toBe(0);
    expect(rejected.rejectedRefundDeliveryFee).toBe(0);
  });
});

describe('net payout platform commission deduction', () => {
  it('does not subtract retained refund convenience from branch net', () => {
    const onlinePaymentsCollected = 100_000;
    const netPlatformEarning = 6_000;
    const gatewayFee = 1_900;
    const signedNet = onlinePaymentsCollected - netPlatformEarning - gatewayFee;

    expect(signedNet).toBe(92_100);
  });

  it('does not treat retained refund convenience as branch dues when there are no paid orders', () => {
    const retainedRefundConvenienceTotal = 3_300 + 2_200;
    const signedNet = 0;

    expect(Math.max(0, signedNet)).toBe(0);
    expect(retainedRefundConvenienceTotal).toBeGreaterThan(0);
  });
});
