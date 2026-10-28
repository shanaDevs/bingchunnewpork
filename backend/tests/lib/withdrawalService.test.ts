import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decimalFieldToCentsNumber } from '../../src/lib/moneyDecimal';

function expectWithdrawalAmountCents(
  result: { amount: Prisma.Decimal },
  cents: number,
) {
  expect(decimalFieldToCentsNumber(result.amount)).toBe(cents);
}
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/platformEarningsService', () => ({
  creditPlatformEarning: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    store: {
      findUnique: vi.fn(),
    },
    storeWithdrawal: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
    },
    promotionUsage: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/walletService', () => ({
  computeBreakdownForPeriod: vi.fn(),
  getOrCreateWallet: vi.fn(),
  getPendingWithdrawalTotal: vi.fn(),
  getWalletSummary: vi.fn(),
  refreshWalletCaches: vi.fn(),
}));

vi.mock('../../src/lib/periodChannelPreview', () => ({
  buildPeriodChannelPreview: vi.fn(),
}));

vi.mock('../../src/lib/promoOwnershipTotals', () => ({
  loadPromoOwnershipTotalsForPeriod: vi.fn(),
  attachPromoOwnershipTotals: (
    breakdown: Record<string, unknown>,
    totals: Record<string, number>,
  ) => ({ ...breakdown, ...totals }),
}));

import { prisma } from '../../src/lib/prisma';
import { creditPlatformEarning } from '../../src/lib/platformEarningsService';
import {
  computeBreakdownForPeriod,
  getWalletSummary,
} from '../../src/lib/walletService';
import { buildPeriodChannelPreview } from '../../src/lib/periodChannelPreview';
import { loadPromoOwnershipTotalsForPeriod } from '../../src/lib/promoOwnershipTotals';
import {
  addDaysToDateStr,
  createApprovedWithdrawalRecord,
  getCalendarPeriodEnd,
  getNextPayoutStartDate,
  getPayoutPeriodEndDate,
  isCalendarPeriodStart,
  PAYOUT_PERIOD_DAYS,
  requestWithdrawal,
  buildStoredWithdrawalBreakdown,
  resolveOpenRollingPayoutWindow,
  resolvePayoutPeriod,
  resolvePayoutPeriodOptions,
  listDuePayoutStoreIds,
  listElapsedPayoutWindows,
  todayDateStr,
  type PayoutPeriodDays,
} from '../../src/lib/withdrawalService';

const asMock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const STORE_ID = 'store-1';
const REQUESTER_ID = 'user-1';
const FIRST_SALE = '2020-01-01';

const baseSummary = {
  storeId: STORE_ID,
  currentBalance: 200_000,
  totalEarnings: 300_000,
  grossLedgerCredits: 300_000,
  netTransferableEarnings: 150_000,
  totalWithdrawn: 30_000,
  pendingWithdrawalTotal: 20_000,
  availableBalance: 100_000,
};

const baseChannelBreakdown = {
  pickupCash: { revenueSubtotal: 0, commission: 0, rate: 0, orderCount: 0, transactionTotal: 0, providerFee: 0, providerFeeRate: 0 },
  pickupCard: { revenueSubtotal: 0, commission: 0, rate: 0, orderCount: 0, transactionTotal: 0, providerFee: 0, providerFeeRate: 0 },
  pickupOnline: { revenueSubtotal: 0, commission: 0, rate: 0, orderCount: 0, transactionTotal: 0, providerFee: 0, providerFeeRate: 0 },
  deliveryOnline: { revenueSubtotal: 0, commission: 0, rate: 0, orderCount: 0, transactionTotal: 0, providerFee: 0, providerFeeRate: 0 },
};

const baseBreakdown = {
  grossAmount: 120_000,
  windowBase: 120_000,
  commissionRate: 0.065,
  tierLabel: 'Up to LKR 1,000,000',
  onlineWalletGross: 110_000,
  onlinePaymentsCollected: 110_000,
  deliveryFee: 5_000,
  commissionFee: 6_000,
  gatewayFee: 3_000,
  gatewayBase: 100_000,
  gatewayRatePct: 1.9,
  gatewayRate: 0.019,
  convenienceFee: 1_000,
  netAmount: 100_000,
  periodDiscountsTotal: 0,
  periodLoyaltyDiscountTotal: 0,
  platformPaybackTotal: 0,
  netPlatformEarning: 6_000,
  periodDues: 0,
  orderCount: 4,
  cancelledByBranchGatewayFee: 0,
  cancelledByBranchOrderCount: 0,
  customerLateCancelSubtotal: 100_000,
  customerLateCancelGatewayDeduction: 1_900,
  customerLateCancelNetAmount: 98_100,
  refundConvenienceFee: 0,
  refundDeliveryFee: 0,
  rejectedRefundSubtotal: 0,
  rejectedRefundGatewayDeduction: 0,
  rejectedRefundNetAmount: 0,
  rejectedRefundConvenienceFee: 0,
  rejectedRefundDeliveryFee: 0,
  sharedPromoTotalDiscount: 0,
  sharedPromoBranchContributionPct: 0,
  sharedPromoBranchContributionAmount: 0,
  sharedPromoPlatformContributionPct: 0,
  sharedPromoPlatformContributionAmount: 0,
  sharedPromoJasonContributionPct: 0,
  sharedPromoJasonContributionAmount: 0,
  finalPayoutAmount: 0,
};

function request(
  overrides: Partial<{
    amount: number;
    remarks: string | undefined;
    periodDays: PayoutPeriodDays;
    isAdvance: boolean;
  }> = {},
) {
  return requestWithdrawal(
    STORE_ID,
    overrides.amount ?? 50_000,
    overrides.remarks,
    REQUESTER_ID,
    overrides.periodDays ?? 15,
    overrides.isAdvance ?? false,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.store.findUnique).mockResolvedValue({ isActive: true });
  asMock(getWalletSummary).mockResolvedValue({ ...baseSummary });
  asMock(computeBreakdownForPeriod).mockResolvedValue({ ...baseBreakdown });
  asMock(buildPeriodChannelPreview).mockResolvedValue({
    period: { from: FIRST_SALE, to: '2020-01-15' },
    breakdown: baseChannelBreakdown,
    totalCommission: 6000,
    totalProviderFee: 3000,
    orderCount: 4,
    storeDiscountsTotal: 0,
    slabInfo: { monthlyBase: 120000, effectiveRate: 0.065, slabIndex: 0 },
  });
  asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue(null);
  asMock(prisma.order.findFirst).mockResolvedValue({
    createdAt: new Date(`${FIRST_SALE}T00:00:00.000Z`),
  });
  asMock(prisma.promotionUsage.findMany).mockResolvedValue([]);
  asMock(loadPromoOwnershipTotalsForPeriod).mockResolvedValue({
    branchOwnedPromoDiscountTotal: 5_000,
    platformOwnedPromoDiscountTotal: 18_600,
  });
  asMock(prisma.storeWithdrawal.create).mockImplementation(
    async (args: { data: Record<string, unknown> }) => args.data,
  );
});

describe('requestWithdrawal — happy paths', () => {
  it('creates a PENDING withdrawal for a 15-day rolling period', async () => {
    const result = await request({ amount: 40_000, remarks: '  July payout  ' });

    expect(prisma.storeWithdrawal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: STORE_ID,
        amount: new Prisma.Decimal(40_000),
        status: 'PENDING',
        remarks: 'July payout',
        periodFrom: new Date('2020-01-01T00:00:00.000Z'),
        periodTo: new Date('2020-01-15T23:59:59.999Z'),
        requestedById: REQUESTER_ID,
        isAdvance: false,
        breakdown: expect.objectContaining({
          ...baseBreakdown,
          branchOwnedPromoDiscountTotal: 5_000,
          platformOwnedPromoDiscountTotal: 18_600,
          netAmount: 100_000,
          channelBreakdown: baseChannelBreakdown,
          finalPayoutAmount: 40_000,
          customerLateCancelSubtotal: 100_000,
          customerLateCancelGatewayDeduction: 1_900,
          customerLateCancelNetAmount: 98_100,
          refundConvenienceFee: 0,
          refundDeliveryFee: 0,
          gatewayRatePct: 1.9,
        }),
      }),
    });
    expect(result).toEqual(expect.objectContaining({ status: 'PENDING' }));
  });

  it('creates a PENDING withdrawal for a 30-day rolling period', async () => {
    await request({ periodDays: 30 });

    expect(prisma.storeWithdrawal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        periodFrom: new Date('2020-01-01T00:00:00.000Z'),
        periodTo: new Date('2020-01-30T23:59:59.999Z'),
        status: 'PENDING',
      }),
    });
  });

  it('creates a PENDING withdrawal for a 40-day rolling period', async () => {
    await request({ periodDays: 40 });

    expect(prisma.storeWithdrawal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        periodFrom: new Date('2020-01-01T00:00:00.000Z'),
        periodTo: new Date('2020-02-09T23:59:59.999Z'),
        status: 'PENDING',
      }),
    });
  });

  it('computes the breakdown for the resolved period date strings', async () => {
    await request();
    expect(computeBreakdownForPeriod).toHaveBeenCalledWith(
      STORE_ID,
      '2020-01-01',
      '2020-01-15',
    );
  });

  it('stores null remarks when remarks are blank or omitted', async () => {
    await request({ remarks: '   ' });
    expect(prisma.storeWithdrawal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ remarks: null }),
    });

    await request({ remarks: undefined });
    expect(prisma.storeWithdrawal.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ remarks: null }),
    });
  });
});

describe('requestWithdrawal — late-cancel refund fee snapshot', () => {
  it('stores refundConvenienceFee and refundDeliveryFee in the breakdown snapshot', async () => {
    asMock(computeBreakdownForPeriod).mockResolvedValue({
      ...baseBreakdown,
      refundConvenienceFee: 3_300,
      refundDeliveryFee: 15_000,
    });

    await request();

    expect(prisma.storeWithdrawal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        breakdown: expect.objectContaining({
          refundConvenienceFee: 3_300,
          refundDeliveryFee: 15_000,
          channelBreakdown: baseChannelBreakdown,
        }),
      }),
    });
  });
});

describe('requestWithdrawal — rejected refund snapshot', () => {
  it('stores rejectedRefund* fields in the breakdown snapshot', async () => {
    asMock(computeBreakdownForPeriod).mockResolvedValue({
      ...baseBreakdown,
      rejectedRefundSubtotal: 50_000,
      rejectedRefundGatewayDeduction: 950,
      rejectedRefundNetAmount: 49_050,
      rejectedRefundConvenienceFee: 2_200,
      rejectedRefundDeliveryFee: 12_000,
    });

    await request();

    expect(prisma.storeWithdrawal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        breakdown: expect.objectContaining({
          rejectedRefundSubtotal: 50_000,
          rejectedRefundGatewayDeduction: 950,
          rejectedRefundNetAmount: 49_050,
          rejectedRefundConvenienceFee: 2_200,
          rejectedRefundDeliveryFee: 12_000,
          channelBreakdown: baseChannelBreakdown,
        }),
      }),
    });
  });
});

describe('buildStoredWithdrawalBreakdown', () => {
  it('requires refund fee fields in the locked snapshot', async () => {
    await expect(
      buildStoredWithdrawalBreakdown(
        { ...baseBreakdown, refundConvenienceFee: undefined as unknown as number },
        baseChannelBreakdown,
      ),
    ).rejects.toThrow('Payout breakdown snapshot missing refundConvenienceFee');

    await expect(
      buildStoredWithdrawalBreakdown(
        { ...baseBreakdown, refundDeliveryFee: undefined as unknown as number },
        baseChannelBreakdown,
      ),
    ).rejects.toThrow('Payout breakdown snapshot missing refundDeliveryFee');

    await expect(
      buildStoredWithdrawalBreakdown(
        { ...baseBreakdown, rejectedRefundSubtotal: undefined as unknown as number },
        baseChannelBreakdown,
      ),
    ).rejects.toThrow('Payout breakdown snapshot missing rejectedRefundSubtotal');
  });

  it('persists refund fee fields alongside channelBreakdown', async () => {
    const snapshot = await buildStoredWithdrawalBreakdown(
      { ...baseBreakdown, refundConvenienceFee: 3_300, refundDeliveryFee: 15_000 },
      baseChannelBreakdown,
    );

    expect(snapshot.refundConvenienceFee).toBe(3_300);
    expect(snapshot.refundDeliveryFee).toBe(15_000);
    expect(snapshot.channelBreakdown).toEqual(baseChannelBreakdown);
    expect(snapshot.platformProviderReceivable.totalPlatformProviderReceivableCents).toBeGreaterThan(0);
  });

  it('stores final payout as branch request plus Jason contribution only', async () => {
    const snapshot = await buildStoredWithdrawalBreakdown(
      {
        ...baseBreakdown,
        sharedPromoPlatformContributionAmount: 2_000,
        sharedPromoJasonContributionAmount: 3_000,
        netPlatformEarning: 4_000,
        netAmount: 102_000,
      },
      baseChannelBreakdown,
      { branchRequestAmountCents: 40_000 },
    );

    expect(snapshot.finalPayoutAmount).toBe(43_000);
    expect(snapshot.netAmount).toBe(102_000);
    expect(snapshot.netPlatformEarning).toBe(4_000);
  });

  it('persists calculated period net and branch request separately', async () => {
    const snapshot = await buildStoredWithdrawalBreakdown(
      { ...baseBreakdown, netAmount: 100_000 },
      baseChannelBreakdown,
      { branchRequestAmountCents: 75_000 },
    );

    expect(snapshot.netAmount).toBe(100_000);
    expect(snapshot.periodNetAmount).toBe(100_000);
    expect(snapshot.branchRequestNetAmount).toBe(75_000);
    expect(snapshot.finalPayoutAmount).toBe(75_000);
  });

  it('locks both gatewayRatePct and raw gatewayRate in the snapshot (FIN-006)', async () => {
    const snapshot = await buildStoredWithdrawalBreakdown(
      { ...baseBreakdown, gatewayRatePct: 1.9, gatewayRate: 0.019 },
      baseChannelBreakdown,
    );

    expect(snapshot.gatewayRatePct).toBe(1.9);
    expect(snapshot.gatewayRate).toBe(0.019);
  });

  it('defaults branch request to period net when not specified', async () => {
    const snapshot = await buildStoredWithdrawalBreakdown(
      { ...baseBreakdown, netAmount: 84_000 },
      baseChannelBreakdown,
    );

    expect(snapshot.periodNetAmount).toBe(84_000);
    expect(snapshot.branchRequestNetAmount).toBe(84_000);
  });
});

describe('payout period days', () => {
  it.each([7, 14, 20, 45])('rejects invalid period length %s', async (days) => {
    await expect(
      requestWithdrawal(STORE_ID, 50_000, undefined, REQUESTER_ID, days as PayoutPeriodDays),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: `Invalid payout period. Choose one of: ${PAYOUT_PERIOD_DAYS.join(', ')} days`,
    });
    expect(prisma.storeWithdrawal.create).not.toHaveBeenCalled();
  });
});

describe('R12: withdrawal amount must be greater than zero', () => {
  it('rejects a zero amount with 400', async () => {
    await expect(request({ amount: 0 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Withdrawal amount must be greater than zero',
    });
  });

  it('rejects a negative amount with 400', async () => {
    await expect(request({ amount: -1 })).rejects.toBeInstanceOf(AppError);
    await expect(request({ amount: -50_000 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Withdrawal amount must be greater than zero',
    });
  });

  it('fails fast before loading the wallet summary', async () => {
    await expect(request({ amount: 0 })).rejects.toBeInstanceOf(AppError);
    expect(getWalletSummary).not.toHaveBeenCalled();
    expect(prisma.storeWithdrawal.create).not.toHaveBeenCalled();
  });

  it('accepts the smallest positive amount (1 cent)', async () => {
    await expect(request({ amount: 1 })).resolves.toEqual(
      expect.objectContaining({ status: 'PENDING' }),
    );
  });
});

describe('FIN-011: deactivated stores cannot request withdrawals', () => {
  it('rejects withdrawal requests when the branch is deactivated', async () => {
    asMock(prisma.store.findUnique).mockResolvedValue({ isActive: false });

    await expect(request()).rejects.toMatchObject({
      statusCode: 403,
      message: 'This branch is deactivated and cannot request withdrawals',
    });
    expect(prisma.storeWithdrawal.create).not.toHaveBeenCalled();
  });
});

describe('FIN-004: one pending withdrawal per branch', () => {
  it('surfaces a 409 when a second pending withdrawal violates the unique index', async () => {
    asMock(prisma.storeWithdrawal.create).mockRejectedValue({
      code: 'P2002',
      meta: { target: ['withdrawal_one_pending_per_store'] },
    });

    await expect(request()).rejects.toMatchObject({
      statusCode: 409,
      message: 'A pending withdrawal already exists for this branch',
    });
  });
});

describe('R13: amount must not exceed available balance', () => {
  it('rejects an amount one cent above the available balance, reporting LKR', async () => {
    await expect(
      request({ amount: baseSummary.availableBalance + 1 }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Insufficient available balance. Available: LKR 1000.00',
    });
    expect(prisma.storeWithdrawal.create).not.toHaveBeenCalled();
  });

  it('accepts an amount exactly equal to the available balance (boundary)', async () => {
    await expect(
      request({ amount: baseSummary.availableBalance }),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'PENDING' }),
    );
  });

  it('rejects any positive amount when the available balance is zero', async () => {
    asMock(getWalletSummary).mockResolvedValue({
      ...baseSummary,
      availableBalance: 0,
    });

    await expect(request({ amount: 1 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Insufficient available balance. Available: LKR 0.00',
    });
  });
});

describe('R16: period starts the day after the last payout request', () => {
  it('starts the next window on the day after the latest period end', async () => {
    asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue({
      periodTo: new Date('2020-01-15T23:59:59.999Z'),
    });

    await request({ periodDays: 15 });

    expect(prisma.storeWithdrawal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        periodFrom: new Date('2020-01-16T00:00:00.000Z'),
        periodTo: new Date('2020-01-30T23:59:59.999Z'),
      }),
    });
  });

  describe('getNextPayoutStartDate', () => {
    it('returns null when the store has no prior PENDING/APPROVED payout', async () => {
      await expect(getNextPayoutStartDate(STORE_ID)).resolves.toBeNull();
    });

    it('only considers PENDING and APPROVED withdrawals (rejected requests do not block)', async () => {
      await getNextPayoutStartDate(STORE_ID);
      expect(prisma.storeWithdrawal.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            storeId: STORE_ID,
            status: { in: ['PENDING', 'APPROVED'] },
            periodTo: { not: null },
          }),
        }),
      );
    });

    it('returns the day after the latest period end, including month rollover', async () => {
      asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue({
        periodTo: new Date('2026-06-30T23:59:59.999Z'),
      });
      await expect(getNextPayoutStartDate(STORE_ID)).resolves.toBe('2026-07-01');

      asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue({
        periodTo: new Date('2026-07-15T23:59:59.999Z'),
      });
      await expect(getNextPayoutStartDate(STORE_ID)).resolves.toBe('2026-07-16');

      asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue({
        periodTo: new Date('2026-12-31T23:59:59.999Z'),
      });
      await expect(getNextPayoutStartDate(STORE_ID)).resolves.toBe('2027-01-01');
    });
  });
});

describe('R17: non-advance amount must not exceed the period net', () => {
  it('rejects a non-advance amount one cent above the period net', async () => {
    asMock(computeBreakdownForPeriod).mockResolvedValue({
      ...baseBreakdown,
      netAmount: 50_000,
    });

    await expect(request({ amount: 50_001 })).rejects.toMatchObject({
      statusCode: 400,
      message:
        'Amount exceeds net for the selected period (LKR 500.00). Enable "custom amount" to request an advance.',
    });
    expect(prisma.storeWithdrawal.create).not.toHaveBeenCalled();
  });

  it('accepts a non-advance amount exactly equal to the period net (boundary)', async () => {
    asMock(computeBreakdownForPeriod).mockResolvedValue({
      ...baseBreakdown,
      netAmount: 50_000,
    });

    await expect(request({ amount: 50_000 })).resolves.toEqual(
      expect.objectContaining({ status: 'PENDING' }),
    );
  });

  it('allows an advance to exceed the period net (while still within available balance)', async () => {
    asMock(computeBreakdownForPeriod).mockResolvedValue({
      ...baseBreakdown,
      netAmount: 50_000,
    });

    await expect(
      request({ amount: 80_000, isAdvance: true }),
    ).resolves.toEqual(
      expect.objectContaining({ isAdvance: true }),
    );
  });

  it('an advance still cannot exceed the available balance (R13 applies first)', async () => {
    asMock(computeBreakdownForPeriod).mockResolvedValue({
      ...baseBreakdown,
      netAmount: 50_000,
    });

    await expect(
      request({ amount: baseSummary.availableBalance + 1, isAdvance: true }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Insufficient available balance'),
    });
  });

  it('rejects any non-advance amount when the period net is zero, but allows an advance', async () => {
    asMock(computeBreakdownForPeriod).mockResolvedValue({
      ...baseBreakdown,
      netAmount: 0,
    });

    await expect(request({ amount: 1 })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('LKR 0.00'),
    });

    await expect(request({ amount: 1, isAdvance: true })).resolves.toEqual(
      expect.objectContaining({ status: 'PENDING' }),
    );
  });
});

describe('resolvePayoutPeriod', () => {
  it('starts from day after last payout when one exists', async () => {
    asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue({
      periodTo: new Date('2026-07-01T23:59:59.999Z'),
    });

    const result = await resolvePayoutPeriod(STORE_ID, 15);

    expect(result.from).toBe('2026-07-02');
    expect(result.to).toBe(addDaysToDateStr('2026-07-02', 14));
    expect(result.days).toBe(15);
  });

  it('falls back to earliest paid order for first payout', async () => {
    asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue(null);
    asMock(prisma.order.findFirst).mockResolvedValue({
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
    });

    const result = await resolvePayoutPeriod(STORE_ID, 30);

    expect(result.from).toBe('2026-06-01');
    expect(result.days).toBe(30);
  });

  it('caps end date at today when ideal end is in the future', async () => {
    asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue(null);
    asMock(prisma.order.findFirst).mockResolvedValue({
      createdAt: new Date(`${todayDateStr()}T10:00:00.000Z`),
    });

    const result = await resolvePayoutPeriod(STORE_ID, 40);

    expect(result.from).toBe(todayDateStr());
    expect(result.to).toBe(todayDateStr());
    expect(result.capped).toBe(true);
  });

  it('returns all preset options', async () => {
    asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue(null);
    asMock(prisma.order.findFirst).mockResolvedValue(null);

    const options = await resolvePayoutPeriodOptions(STORE_ID);

    expect(options).toHaveLength(PAYOUT_PERIOD_DAYS.length);
    expect(options.map((opt) => opt.days)).toEqual([...PAYOUT_PERIOD_DAYS]);
  });
});

describe('resolveOpenRollingPayoutWindow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('walks past elapsed windows to the current open cycle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
    asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue(null);
    asMock(prisma.order.findFirst).mockResolvedValue({
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
    });

    const open = await resolveOpenRollingPayoutWindow(STORE_ID, 15);

    expect(open).toEqual({
      days: 15,
      from: '2026-10-14',
      to: '2026-10-20',
      capped: true,
    });
  });
});

describe('listDuePayoutStoreIds', () => {
  it('returns only stores whose 15-day window is fully elapsed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    asMock(prisma.storeWithdrawal.findFirst).mockImplementation((args: { where?: { storeId?: string } }) => {
      if (args?.where?.storeId === 'due-store') {
        return Promise.resolve({ periodTo: new Date('2026-01-01T23:59:59.999Z') });
      }
      return Promise.resolve(null);
    });
    asMock(prisma.order.findFirst).mockResolvedValue({
      createdAt: new Date(`${todayDateStr()}T10:00:00.000Z`),
    });

    const result = await listDuePayoutStoreIds(['due-store', 'capped-store'], 15);

    expect(result).toHaveLength(1);
    expect(result[0].storeId).toBe('due-store');
    expect(result[0].capped).toBe(false);
    expect(result[0].days).toBe(15);
    vi.useRealTimers();
  });
});

describe('listElapsedPayoutWindows', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists successive fully-elapsed 15-day windows after the last payout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T12:00:00.000Z'));
    asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue({
      periodTo: new Date('2026-08-10T23:59:59.999Z'),
    });

    const windows = await listElapsedPayoutWindows(STORE_ID, 15);

    expect(windows.map((w) => ({ from: w.from, to: w.to }))).toEqual([
      { from: '2026-08-11', to: '2026-08-25' },
      { from: '2026-08-26', to: '2026-09-09' },
      { from: '2026-09-10', to: '2026-09-24' },
    ]);
    expect(windows.every((w) => w.capped === false && w.days === 15)).toBe(true);
  });

  it('starts from the earliest paid order when there is no prior payout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue(null);
    asMock(prisma.order.findFirst).mockResolvedValue({
      createdAt: new Date('2026-06-21T10:00:00.000Z'),
    });

    const windows = await listElapsedPayoutWindows(STORE_ID, 15);

    expect(windows).toEqual([
      { days: 15, from: '2026-06-21', to: '2026-07-05', capped: false },
      { days: 15, from: '2026-07-06', to: '2026-07-20', capped: false },
    ]);
  });

  it('returns an empty list when the current window is still in progress', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue({
      periodTo: new Date('2026-07-10T23:59:59.999Z'),
    });

    const windows = await listElapsedPayoutWindows(STORE_ID, 15);

    expect(windows).toEqual([]);
  });

  it('caps the number of returned windows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T12:00:00.000Z'));
    asMock(prisma.storeWithdrawal.findFirst).mockResolvedValue({
      periodTo: new Date('2026-08-10T23:59:59.999Z'),
    });

    const windows = await listElapsedPayoutWindows(STORE_ID, 15, 2);

    expect(windows).toHaveLength(2);
    expect(windows[0].from).toBe('2026-08-11');
    expect(windows[1].to).toBe('2026-09-09');
  });
});

describe('deprecated calendar helpers', () => {
  it('isCalendarPeriodStart accepts only the 1st and the 16th', () => {
    expect(isCalendarPeriodStart('2026-07-01')).toBe(true);
    expect(isCalendarPeriodStart('2026-07-16')).toBe(true);
    expect(isCalendarPeriodStart('2026-07-02')).toBe(false);
    expect(isCalendarPeriodStart('2026-07-15')).toBe(false);
  });

  it('getCalendarPeriodEnd maps half-month boundaries', () => {
    expect(getCalendarPeriodEnd('2026-07-01')).toBe('2026-07-15');
    expect(getCalendarPeriodEnd('2026-07-16')).toBe('2026-07-31');
    expect(getCalendarPeriodEnd('2026-02-16')).toBe('2026-02-28');
    expect(getCalendarPeriodEnd('2028-02-16')).toBe('2028-02-29');
    expect(() => getCalendarPeriodEnd('2026-07-05')).toThrow('Invalid payout period start');
  });

  it('getPayoutPeriodEndDate delegates to getCalendarPeriodEnd', () => {
    expect(getPayoutPeriodEndDate('2026-07-16')).toBe('2026-07-31');
  });
});

describe('createApprovedWithdrawalRecord', () => {
  it('creates an approved withdrawal and credits platform earnings', async () => {
    const reviewedAt = new Date('2026-07-16T10:00:00.000Z');
    asMock(prisma.storeWithdrawal.create).mockResolvedValue({
      id: 'wd-1',
      storeId: 'store-1',
      breakdown: { commissionFee: 5000, convenienceFee: 300 },
      periodFrom: new Date('2026-07-01T00:00:00.000Z'),
      periodTo: new Date('2026-07-15T23:59:59.999Z'),
      reviewedAt,
    });

    await createApprovedWithdrawalRecord({
      storeId: 'store-1',
      amount: 100000,
      remarks: 'Settlement payout',
      requestedById: 'admin-1',
      reviewedById: 'admin-1',
      walletTransactionId: 'txn-1',
      periodFrom: new Date('2026-07-01T00:00:00.000Z'),
      periodTo: new Date('2026-07-15T23:59:59.999Z'),
      breakdown: { commissionFee: 5000, convenienceFee: 300 },
    });

    expect(prisma.storeWithdrawal.create).toHaveBeenCalled();
    expect(creditPlatformEarning).toHaveBeenCalledWith(
      expect.objectContaining({
        storeWithdrawalId: 'wd-1',
        storeId: 'store-1',
        approvedAt: reviewedAt,
      }),
      undefined,
    );
  });
});
