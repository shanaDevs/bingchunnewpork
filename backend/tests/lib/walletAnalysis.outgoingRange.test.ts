import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    storeWallet: { findMany: vi.fn() },
    order: { findMany: vi.fn() },
    store: { findMany: vi.fn() },
    refund: { findMany: vi.fn() },
    jasonLedgerEntry: { aggregate: vi.fn(), findMany: vi.fn() },
  },
  getPrismaFanOutLimit: () => 8,
}));

vi.mock('../../src/lib/walletService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/walletService')>();
  return {
    ...actual,
    computeBreakdownForPeriodOrders: vi.fn(),
    loadRefundPenaltyTotalsByStore: vi.fn().mockResolvedValue(new Map()),
    loadRefundPenaltyTotalsByChartBuckets: vi.fn().mockResolvedValue(new Map()),
  };
});

vi.mock('../../src/lib/deliveryWalletService', () => ({
  getDeliveryWalletSummary: vi.fn(),
  getDeliveryWalletNetByBucket: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../../src/lib/jasonLedgerSchema', () => ({
  ensureJasonLedgerSchema: vi.fn(),
}));

vi.mock('../../src/lib/appSchema', () => ({
  getGatewayFeeRate: vi.fn().mockResolvedValue(0.03),
}));

import { prisma } from '../../src/lib/prisma';
import {
  computeBreakdownForPeriodOrders,
  loadRefundPenaltyTotalsByStore,
} from '../../src/lib/walletService';
import { getDeliveryWalletSummary } from '../../src/lib/deliveryWalletService';
import { getOutgoingFlowsForRange, sumJasonInvestedLkrForRange } from '../../src/lib/walletAnalysis';

describe('getOutgoingFlowsForRange', () => {
  beforeEach(() => {
    vi.mocked(prisma.storeWallet.findMany).mockReset();
    vi.mocked(prisma.order.findMany).mockReset();
    vi.mocked(prisma.store.findMany).mockReset();
    vi.mocked(prisma.jasonLedgerEntry.aggregate).mockReset();
    vi.mocked(computeBreakdownForPeriodOrders).mockReset();
    vi.mocked(getDeliveryWalletSummary).mockReset();
    vi.mocked(loadRefundPenaltyTotalsByStore).mockReset();
    vi.mocked(loadRefundPenaltyTotalsByStore).mockResolvedValue(new Map());
  });

  it('returns an empty list when there are no store wallets', async () => {
    vi.mocked(prisma.storeWallet.findMany).mockResolvedValue([] as never);

    await expect(
      getOutgoingFlowsForRange({ from: '2026-09-01', to: '2026-09-22' }),
    ).resolves.toEqual([]);
    expect(computeBreakdownForPeriodOrders).not.toHaveBeenCalled();
    expect(getDeliveryWalletSummary).not.toHaveBeenCalled();
  });

  it('does not run per-store breakdowns when wallets have no paid orders', async () => {
    vi.mocked(prisma.storeWallet.findMany).mockResolvedValue([
      { storeId: 'store-1' },
      { storeId: 'store-2' },
      { storeId: 'store-3' },
    ] as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
    vi.mocked(getDeliveryWalletSummary).mockResolvedValue({
      netForDelivery: 0,
      branches: [],
    } as never);
    vi.mocked(prisma.jasonLedgerEntry.aggregate).mockResolvedValue({
      _sum: { amount: 0 },
    } as never);

    await getOutgoingFlowsForRange({ from: '2026-09-01', to: '2026-09-22' });

    expect(computeBreakdownForPeriodOrders).not.toHaveBeenCalled();
    expect(loadRefundPenaltyTotalsByStore).toHaveBeenCalledTimes(1);
    expect(prisma.store.findMany).not.toHaveBeenCalled();
  });

  it('builds canonical outgoing labels from period sources', async () => {
    vi.mocked(prisma.storeWallet.findMany).mockResolvedValue([{ storeId: 'store-1' }] as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        storeId: 'store-1',
        total: 1000,
        createdAt: new Date('2026-09-10T00:00:00.000Z'),
      },
    ] as never);
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-1', platformDiscountPaybackEnabled: false },
    ] as never);
    vi.mocked(loadRefundPenaltyTotalsByStore).mockResolvedValue(
      new Map([
        [
          'store-1',
          {
            cancelledByBranchGatewayFee: 2500,
            cancelledByBranchOrderCount: 1,
            customerLateCancelSubtotal: 0,
            customerLateCancelGatewayDeduction: 0,
            customerLateCancelNetAmount: 0,
            refundConvenienceFee: 0,
            refundDeliveryFee: 0,
            rejectedRefundSubtotal: 0,
            rejectedRefundGatewayDeduction: 0,
            rejectedRefundNetAmount: 0,
            rejectedRefundConvenienceFee: 0,
            rejectedRefundDeliveryFee: 0,
          },
        ],
      ]),
    );
    vi.mocked(computeBreakdownForPeriodOrders).mockResolvedValue({
      gatewayFee: 5000,
      commissionFee: 12000,
      cancelledByBranchGatewayFee: 2500,
    } as never);
    vi.mocked(getDeliveryWalletSummary).mockResolvedValue({
      netForDelivery: 340,
      branches: [],
    } as never);
    vi.mocked(prisma.jasonLedgerEntry.aggregate).mockResolvedValue({
      _sum: { amount: 7500 },
    } as never);

    const rows = await getOutgoingFlowsForRange({ from: '2026-09-01', to: '2026-09-22' });

    expect(computeBreakdownForPeriodOrders).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([
      { key: 'partner', label: 'Delivery partner payment', amount: 340 },
      { key: 'platform', label: 'Platform provider commission', amount: 120 },
      { key: 'gateway', label: 'Payment gateway payments', amount: 50 },
      { key: 'refundBankPenalty', label: 'Refund bank penalty payment', amount: 25 },
      { key: 'jasonExpenses', label: 'Jason expenses', amount: 75 },
    ]);
  });

  it('keeps refund-bank penalty from batched totals when stores have no paid orders', async () => {
    vi.mocked(prisma.storeWallet.findMany).mockResolvedValue([
      { storeId: 'store-1' },
      { storeId: 'store-2' },
    ] as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
    vi.mocked(loadRefundPenaltyTotalsByStore).mockResolvedValue(
      new Map([
        [
          'store-2',
          {
            cancelledByBranchGatewayFee: 2500,
            cancelledByBranchOrderCount: 1,
            customerLateCancelSubtotal: 0,
            customerLateCancelGatewayDeduction: 0,
            customerLateCancelNetAmount: 0,
            refundConvenienceFee: 0,
            refundDeliveryFee: 0,
            rejectedRefundSubtotal: 0,
            rejectedRefundGatewayDeduction: 0,
            rejectedRefundNetAmount: 0,
            rejectedRefundConvenienceFee: 0,
            rejectedRefundDeliveryFee: 0,
          },
        ],
      ]),
    );
    vi.mocked(getDeliveryWalletSummary).mockResolvedValue({
      netForDelivery: 340,
      branches: [],
    } as never);
    vi.mocked(prisma.jasonLedgerEntry.aggregate).mockResolvedValue({
      _sum: { amount: 7500 },
    } as never);

    const rows = await getOutgoingFlowsForRange({ from: '2026-09-01', to: '2026-09-22' });

    expect(computeBreakdownForPeriodOrders).not.toHaveBeenCalled();
    expect(rows).toEqual([
      { key: 'partner', label: 'Delivery partner payment', amount: 340 },
      { key: 'refundBankPenalty', label: 'Refund bank penalty payment', amount: 25 },
      { key: 'jasonExpenses', label: 'Jason expenses', amount: 75 },
    ]);
  });
});

describe('sumJasonInvestedLkrForRange', () => {
  beforeEach(() => {
    vi.mocked(prisma.jasonLedgerEntry.aggregate).mockReset();
  });

  it('converts active investment cents to LKR for a Date window', async () => {
    vi.mocked(prisma.jasonLedgerEntry.aggregate).mockResolvedValue({
      _sum: { amount: 150050 },
    } as never);

    const range = {
      gte: new Date('2026-09-01T00:00:00.000Z'),
      lte: new Date('2026-09-22T23:59:59.999Z'),
    };

    await expect(sumJasonInvestedLkrForRange(range)).resolves.toBe(1500.5);
    expect(prisma.jasonLedgerEntry.aggregate).toHaveBeenCalledWith({
      _sum: { amount: true },
      where: {
        type: 'INVESTMENT',
        isActive: true,
        occurredAt: { gte: range.gte, lte: range.lte },
      },
    });
  });
});
