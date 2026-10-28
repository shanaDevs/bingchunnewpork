import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/platformEarningsSchema', () => ({
  ensurePlatformEarningsSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    platformEarning: {
      upsert: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      updateMany: vi.fn(),
    },
    platformMonthlySettlement: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/lib/walletService', () => ({
  computeBreakdownForPeriod: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { computePlatformProviderReceivable } from '@bingchun/settlement';
import {
  creditPlatformEarning,
  getMonthlyEarningsBreakdown,
  getMonthlyEarningsSummary,
  getSettlementPreview,
  settleMonth,
  toCalendarMonth,
} from '../../src/lib/platformEarningsService';
import { expectDbCents } from '../helpers/moneyExpect';

const mockedPrisma = vi.mocked(prisma);

const sampleEarning = {
  id: 'e1',
  storeId: 's1',
  storeWithdrawalId: 'w1',
  periodFrom: new Date('2026-07-01T00:00:00.000Z'),
  periodTo: new Date('2026-07-15T23:59:59.999Z'),
  calendarMonth: '2026-07',
  commissionAmount: 12400,
  convenienceFeeAmount: 820,
  platformPaybackAmount: 0,
  totalEarned: 13220,
  approvedAt: new Date('2026-07-16T10:00:00.000Z'),
  breakdown: {},
  settlementId: null,
  store: { id: 's1', name: 'Bing Chun - Nugegoda' },
};

describe('platformEarningsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives calendar month from approval date', () => {
    expect(toCalendarMonth(new Date('2026-07-15T12:00:00.000Z'))).toBe('2026-07');
  });

  it('credits platform earning from withdrawal breakdown', async () => {
    mockedPrisma.platformEarning.upsert.mockResolvedValue({ id: 'earning-1' } as never);
    const breakdown = { commissionFee: 125000, convenienceFee: 8200, gatewayRatePct: 1.9 };
    const expectedTotal = computePlatformProviderReceivable({
      commissionFeeCents: 125000,
      normalConvenienceFeeCents: 8200,
      gatewayRatePct: 1.9,
    }).totalPlatformProviderReceivableCents;

    await creditPlatformEarning({
      storeWithdrawalId: 'wd-1',
      storeId: 'store-1',
      breakdown,
      periodFrom: new Date('2026-07-01T00:00:00.000Z'),
      periodTo: new Date('2026-07-15T23:59:59.999Z'),
      approvedAt: new Date('2026-07-16T10:00:00.000Z'),
    });

    expect(mockedPrisma.platformEarning.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeWithdrawalId: 'wd-1' },
      }),
    );
    const upsertArg = mockedPrisma.platformEarning.upsert.mock.calls[0][0];
    expectDbCents(upsertArg.create.commissionAmount, 125_000);
    expectDbCents(upsertArg.create.convenienceFeeAmount, 8_200);
    expectDbCents(upsertArg.create.platformPaybackAmount, 0);
    expectDbCents(upsertArg.create.totalEarned, expectedTotal);
    expect(upsertArg.create.calendarMonth).toBe('2026-07');
    expect(upsertArg.create.settlementId).toBeNull();
  });

  it('subtracts platform payback from total earned via receivable formula', async () => {
    mockedPrisma.platformEarning.upsert.mockResolvedValue({ id: 'earning-2' } as never);
    const expectedTotal = computePlatformProviderReceivable({
      commissionFeeCents: 292500,
      platformPaybackCents: 500000,
      gatewayRatePct: 1.9,
    }).totalPlatformProviderReceivableCents;

    await creditPlatformEarning({
      storeWithdrawalId: 'wd-2',
      storeId: 'store-1',
      breakdown: { commissionFee: 292500, convenienceFee: 0, platformPaybackTotal: 500000, gatewayRatePct: 1.9 },
      periodFrom: new Date('2026-07-01T00:00:00.000Z'),
      periodTo: new Date('2026-07-15T23:59:59.999Z'),
      approvedAt: new Date('2026-07-16T10:00:00.000Z'),
    });

    const upsertArg = mockedPrisma.platformEarning.upsert.mock.calls[0][0];
    expectDbCents(upsertArg.create.commissionAmount, 292_500);
    expectDbCents(upsertArg.create.platformPaybackAmount, 500_000);
    expectDbCents(upsertArg.create.totalEarned, expectedTotal);
  });

  it('aggregates monthly earnings summary with platform position', async () => {
    mockedPrisma.platformEarning.groupBy
      .mockResolvedValueOnce([
        {
          calendarMonth: '2026-07',
          _sum: { commissionAmount: 45200, convenienceFeeAmount: 3100, totalEarned: 48300 },
          _count: { id: 3 },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          calendarMonth: '2026-07',
          _sum: { totalEarned: 48300 },
          _count: { id: 3 },
        },
      ] as never);
    mockedPrisma.platformMonthlySettlement.findMany.mockResolvedValue([] as never);
    mockedPrisma.platformEarning.aggregate
      .mockResolvedValueOnce({ _sum: { totalEarned: 48300 }, _count: { id: 3 } } as never)
      .mockResolvedValueOnce({ _sum: { totalEarned: 48300 } } as never)
      .mockResolvedValueOnce({ _sum: { totalEarned: 0 } } as never);

    const summary = await getMonthlyEarningsSummary();

    expect(summary.months).toEqual([
      expect.objectContaining({
        calendarMonth: '2026-07',
        totalCommission: 45200,
        status: 'OPEN',
        pendingCount: 3,
        canSettle: true,
      }),
    ]);
    expect(summary.platformPosition).toEqual({
      lifetimeEarned: 48300,
      availableToSettle: 48300,
      settledWithdrawn: 0,
      totalPayoutsTracked: 3,
    });
  });

  it('marks month as SETTLED_WITH_PENDING when settled but late payouts remain', async () => {
    mockedPrisma.platformEarning.groupBy
      .mockResolvedValueOnce([
        {
          calendarMonth: '2026-07',
          _sum: { commissionAmount: 10000, convenienceFeeAmount: 500, totalEarned: 10500 },
          _count: { id: 2 },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          calendarMonth: '2026-07',
          _sum: { totalEarned: 2000 },
          _count: { id: 1 },
        },
      ] as never);
    mockedPrisma.platformMonthlySettlement.findMany.mockResolvedValue([
      {
        calendarMonth: '2026-07',
        status: 'SETTLED',
        settledAt: new Date('2026-08-01T00:00:00.000Z'),
        notes: null,
      },
    ] as never);
    mockedPrisma.platformEarning.aggregate
      .mockResolvedValueOnce({ _sum: { totalEarned: 10500 }, _count: { id: 2 } } as never)
      .mockResolvedValueOnce({ _sum: { totalEarned: 2000 } } as never)
      .mockResolvedValueOnce({ _sum: { totalEarned: 8500 } } as never);

    const summary = await getMonthlyEarningsSummary();

    expect(summary.months[0].status).toBe('SETTLED_WITH_PENDING');
    expect(summary.months[0].pendingCount).toBe(1);
    expect(summary.months[0].canSettle).toBe(false);
  });

  it('builds monthly breakdown with branch groups and payout labels', async () => {
    mockedPrisma.platformEarning.findMany.mockResolvedValue([
      sampleEarning,
      {
        ...sampleEarning,
        id: 'e2',
        storeWithdrawalId: 'w2',
        commissionAmount: 11200,
        convenienceFeeAmount: 780,
        totalEarned: 11980,
        approvedAt: new Date('2026-07-20T10:00:00.000Z'),
      },
    ] as never);
    mockedPrisma.platformMonthlySettlement.findUnique.mockResolvedValue(null);
    mockedPrisma.platformEarning.count.mockResolvedValue(2);

    const breakdown = await getMonthlyEarningsBreakdown('2026-07');

    expect(breakdown.items).toHaveLength(2);
    expect(breakdown.items[0].payoutLabel).toBe('Nugegoda Branch — Payout #1');
    expect(breakdown.items[1].payoutLabel).toBe('Nugegoda Branch — Payout #2');
    expect(breakdown.branches).toHaveLength(1);
    expect(breakdown.branches[0].payoutCount).toBe(2);
    expect(breakdown.branches[0].totalEarned).toBe(25200);
    expect(breakdown.totals.totalEarned).toBe(25200);
  });

  it('builds settlement preview with carried-forward items', async () => {
    mockedPrisma.platformEarning.findMany.mockResolvedValue([
      {
        ...sampleEarning,
        calendarMonth: '2026-06',
        id: 'e-old',
        storeWithdrawalId: 'w-old',
      },
      {
        ...sampleEarning,
        id: 'e-aug',
        storeWithdrawalId: 'w-aug',
        calendarMonth: '2026-08',
      },
    ] as never);

    const preview = await getSettlementPreview('2026-08');

    expect(preview.items).toHaveLength(2);
    expect(preview.carriedForwardItems).toHaveLength(1);
    expect(preview.currentMonthItems).toHaveLength(1);
    expect(preview.carriedForwardItems[0].carriedForward).toBe(true);
    expect(preview.branches).toHaveLength(1);
  });

  it('settles a month and stamps settlementId on included earnings', async () => {
    mockedPrisma.platformMonthlySettlement.findUnique.mockResolvedValue(null);
    mockedPrisma.platformEarning.findMany.mockResolvedValue([sampleEarning] as never);

    const settlementRecord = {
      id: 'settlement-1',
      calendarMonth: '2026-07',
      status: 'SETTLED',
    };

    mockedPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        platformMonthlySettlement: {
          upsert: vi.fn().mockResolvedValue(settlementRecord),
        },
        platformEarning: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return fn(tx as never);
    });

    const result = await settleMonth('2026-07', 'admin-1', 'July close-out');

    expect(result.status).toBe('SETTLED');
    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('rejects settling an already settled month', async () => {
    mockedPrisma.platformMonthlySettlement.findUnique.mockResolvedValue({
      calendarMonth: '2026-07',
      status: 'SETTLED',
    } as never);

    await expect(settleMonth('2026-07', 'admin-1')).rejects.toThrow(
      'This month has already been settled',
    );
  });

  it('rejects settling when no earnings are available', async () => {
    mockedPrisma.platformMonthlySettlement.findUnique.mockResolvedValue(null);
    mockedPrisma.platformEarning.findMany.mockResolvedValue([] as never);

    await expect(settleMonth('2026-07', 'admin-1')).rejects.toThrow(
      'No platform earnings found for this month',
    );
  });
});
