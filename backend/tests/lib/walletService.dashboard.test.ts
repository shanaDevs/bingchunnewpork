import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: { groupBy: vi.fn() },
    storeWithdrawal: { aggregate: vi.fn(), findMany: vi.fn() },
    commissionSettlement: { aggregate: vi.fn() },
    refund: { aggregate: vi.fn() },
    storeWallet: { upsert: vi.fn(), aggregate: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock('../../src/lib/deliveryPayoutSchema', () => ({
  ensureDeliveryPayoutSchema: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../src/lib/prisma';
import { getBranchWalletDashboard, getSuperAdminWalletDashboard } from '../../src/lib/walletService';

const storeId = 'store-branch-1';

function mockPaidOrderGroups(
  orders: { total: number; orderMode: string; paymentMethod: string }[],
) {
  const map = new Map<string, number>();
  for (const o of orders) {
    const key = `${o.orderMode}\0${o.paymentMethod}`;
    map.set(key, (map.get(key) ?? 0) + o.total);
  }
  return [...map.entries()].map(([key, total]) => {
    const [orderMode, paymentMethod] = key.split('\0');
    return { orderMode, paymentMethod, _sum: { total } };
  });
}

describe('getBranchWalletDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.storeWallet.upsert).mockResolvedValue({
      id: 'w1',
      storeId,
      balance: 48_500,
      totalEarnings: 200_000,
      totalWithdrawn: 30_000,
      lastSettledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.order.groupBy).mockResolvedValue(
      mockPaidOrderGroups([
        { total: 100, orderMode: 'TAKEAWAY', paymentMethod: 'CARD' },
        { total: 200, orderMode: 'DELIVERY', paymentMethod: 'PAYHERE' },
      ]) as never,
    );
    vi.mocked(prisma.storeWithdrawal.aggregate).mockResolvedValue({
      _sum: { amount: 22_000_00 },
    } as never);
    vi.mocked(prisma.commissionSettlement.aggregate).mockResolvedValue({
      _sum: { totalCommission: 12_000_00 },
    } as never);
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      {
        breakdown: {
          branches: [
            { storeId, netForDelivery: 1500 },
            { storeId: 'other-store', netForDelivery: 900 },
          ],
        },
      },
      {
        breakdown: {
          branches: [{ storeId, netForDelivery: 500 }],
        },
      },
    ] as never);
    vi.mocked(prisma.refund.aggregate).mockResolvedValue({
      _sum: { notReturningSubtotal: 1250 },
    } as never);
  });

  it('aggregates earnings, payments, live balance, and refunds for a branch', async () => {
    const result = await getBranchWalletDashboard(storeId);

    expect(result.allTimeEarnings.pickupOnlineIn).toBe(10_000);
    expect(result.allTimeEarnings.deliveryOnlineIn).toBe(20_000);
    expect(result.allTimeEarnings.total).toBe(30_000);
    expect(result.allTimePayments.toBranchCents).toBe(22_000_00);
    expect(result.allTimePayments.toPlatformCents).toBe(12_000_00);
    expect(result.allTimePayments.toDeliveryLkr).toBe(2000);
    expect(result.liveEarningsCents).toBe(48_500);
    expect(result.refundsLkr).toBe(1250);
  });

  it('keeps live balance and refunds all-time when a period filter is applied', async () => {
    const result = await getBranchWalletDashboard(storeId, {
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(result.liveEarningsCents).toBe(48_500);
    expect(result.refundsLkr).toBe(1250);
    expect(prisma.refund.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ['COMPLETE', 'REJECTED'] },
          order: { storeId },
        },
        _sum: { notReturningSubtotal: true },
      }),
    );
  });

  it('scopes delivery payouts and refunds to the requested store', async () => {
    await getBranchWalletDashboard(storeId);

    expect(prisma.storeWithdrawal.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId, status: 'APPROVED' },
      }),
    );
    expect(prisma.commissionSettlement.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId, status: 'VERIFIED' },
      }),
    );
    expect(prisma.refund.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          order: { storeId },
        }),
      }),
    );
  });
});

describe('getSuperAdminWalletDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.order.groupBy).mockResolvedValue(
      mockPaidOrderGroups([
        { total: 100, orderMode: 'TAKEAWAY', paymentMethod: 'CARD' },
        { total: 150, orderMode: 'TAKEAWAY', paymentMethod: 'CARD' },
        { total: 200, orderMode: 'DELIVERY', paymentMethod: 'PAYHERE' },
      ]) as never,
    );
    vi.mocked(prisma.storeWithdrawal.findMany).mockResolvedValue([
      { amount: 10_000_00, breakdown: { finalPayoutAmount: 9_500_00 } },
      { amount: 5_000_00, breakdown: null },
    ] as never);
    vi.mocked(prisma.commissionSettlement.aggregate).mockResolvedValue({
      _sum: { totalCommission: 25_000_00 },
    } as never);
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ sum: 3200 }] as never);
    vi.mocked(prisma.storeWallet.aggregate).mockResolvedValue({
      _sum: { balance: 150_000_00 },
    } as never);
    vi.mocked(prisma.refund.aggregate).mockResolvedValue({
      _sum: { notReturningSubtotal: 1500 },
    } as never);
  });

  it('aggregates global earnings, payments, live balance, and refunds', async () => {
    const result = await getSuperAdminWalletDashboard();

    expect(result.allTimeEarnings.pickupOnlineIn).toBe(25_000);
    expect(result.allTimeEarnings.deliveryOnlineIn).toBe(20_000);
    expect(result.allTimeEarnings.total).toBe(45_000);
    expect(result.allTimePayments.toBranchCents).toBe(14_500_00);
    expect(result.allTimePayments.toPlatformCents).toBe(25_000_00);
    expect(result.allTimePayments.toDeliveryLkr).toBe(3200);
    expect(result.liveEarningsCents).toBe(150_000_00);
    expect(result.refundsLkr).toBe(1500);
  });

  it('uses finalPayoutAmount for branch payouts instead of raw withdrawal amount', async () => {
    await getSuperAdminWalletDashboard();

    expect(prisma.storeWithdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'APPROVED' },
      }),
    );
    expect(prisma.commissionSettlement.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'VERIFIED' },
      }),
    );
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(`SUM("amount")`),
    );
    expect(prisma.refund.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['COMPLETE', 'REJECTED'] } },
        _sum: { notReturningSubtotal: true },
      }),
    );
  });
});
