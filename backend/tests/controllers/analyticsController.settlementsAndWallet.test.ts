import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';
import { createAnalyticsPrismaMock, resetAnalyticsPrismaDefaults } from '../helpers/analyticsPrisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: createAnalyticsPrismaMock(),
}));

import { getSettlementReports, getWalletLedger } from '../../src/controllers/analyticsController';
import { prisma } from '../../src/lib/prisma';

describe('getSettlementReports', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
  });

  function deliveryOnlyBreakdown() {
    return {
      deliveryOnline: {
        revenueSubtotal: 1000,
        commission: 65,
        rate: 0.065,
        orderCount: 1,
        transactionTotal: 1265,
        providerFee: 35,
        providerFeeRate: 0.019,
        convenientFeeTotal: 65,
        convenienceFeeBaseTotal: 1000,
        deliveryFeeTotal: 200,
        grossSalesTotal: 1000,
        subtotalBeforeDiscount: 1000,
        discountTotal: 0,
        payhereTotal: 1265,
        payhereRevenueSubtotal: 1000,
        payhereDeliveryFee: 200,
        payhereConvenienceFee: 65,
        cardTotal: 0,
        loyaltyPointsTotal: 0,
      },
    };
  }

  it('computes gross sales, commission, fees and payout from the stored settlement breakdown', async () => {
    vi.mocked(prisma.commissionSettlement.findMany).mockResolvedValue([
      {
        id: 's1',
        statementRef: 'REF-1',
        store: { name: 'Store A', city: 'Colombo' },
        periodFrom: new Date('2026-07-01'),
        periodTo: new Date('2026-07-15'),
        breakdown: deliveryOnlyBreakdown(),
        status: 'VERIFIED',
        storeWithdrawal: null,
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getSettlementReports(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        settlements: [
          {
            id: 's1',
            statementRef: 'REF-1',
            branchName: 'Store A',
            cycleFrom: new Date('2026-07-01'),
            cycleTo: new Date('2026-07-15'),
            grossSales: 1000,
            totalDeliveryFees: 400,
            payhereFees: 35,
            dartcodesCommission: 65,
            lockedSlabRate: 6.5,
            convenienceFeesCollected: 65,
            totalDartcodesRevenue: 130,
            netBranchShare: 1300,
            offlineCollected: 0,
            finalPayoutAmount: 1300,
            payoutStatus: 'SETTLED',
            settlementStatus: 'VERIFIED',
          },
        ],
        count: 1,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('uses the linked withdrawal status as payoutStatus when available', async () => {
    vi.mocked(prisma.commissionSettlement.findMany).mockResolvedValue([
      {
        id: 's1',
        statementRef: 'REF-1',
        store: { name: 'Store A', city: 'Colombo' },
        periodFrom: new Date('2026-07-01'),
        periodTo: new Date('2026-07-15'),
        breakdown: deliveryOnlyBreakdown(),
        status: 'VERIFIED',
        storeWithdrawal: { amount: 130000, status: 'PAID', breakdown: null, isAdvance: false },
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getSettlementReports(req, res, next);

    const data = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data as {
      settlements: Array<{ payoutStatus: string }>;
    };
    expect(data.settlements[0].payoutStatus).toBe('PAID');
  });

  it('filters withdrawals and settlements by storeId and overlapping cycle dates', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { storeId: 'store-a', from: '2026-07-01', to: '2026-07-31' },
    });
    const res = createMockRes();

    await getSettlementReports(req, res, next);

    expect(prisma.storeWithdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-a',
          status: { in: ['PENDING', 'APPROVED'] },
          periodFrom: expect.objectContaining({ lte: expect.any(Date) }),
          periodTo: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
    expect(prisma.commissionSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-a',
          status: { not: 'REJECTED' },
        }),
      }),
    );
  });

  it('accepts year-to-date ranges used on the settlement sheet', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { storeId: 'store-a', from: '2026-01-01', to: '2026-11-07' },
    });
    const res = createMockRes();

    await getSettlementReports(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { settlements: [], count: 0 },
    });
  });

  it('loads 15-day branch payouts onto the settlement sheet', async () => {
    vi.mocked(prisma.storeWithdrawal.findMany).mockResolvedValue([
      {
        id: 'wd-1',
        invoiceRef: 'WD-1',
        periodFrom: new Date('2026-10-20'),
        periodTo: new Date('2026-11-03'),
        amount: 14443980,
        status: 'APPROVED',
        breakdown: {
          grossAmount: 41214200,
          deliveryFee: 0,
          gatewayFee: 275975,
          commissionFee: 645165,
          convenienceFee: 0,
          channelBreakdown: {},
        },
        store: { name: 'Nugegoda' },
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { storeId: 'store-a' },
    });
    const res = createMockRes();

    await getSettlementReports(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        settlements: [
          expect.objectContaining({
            id: 'wd-1',
            branchName: 'Nugegoda',
            payoutStatus: 'PAID',
            grossSales: 412142,
            payhereFees: 2759.75,
            dartcodesCommission: 6451.65,
            finalPayoutAmount: 144439.8,
          }),
        ],
        count: 1,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns an empty list when there are no settlements', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getSettlementReports(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { settlements: [], count: 0 },
    });
  });

  it('forwards validation errors for a malformed date', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { from: 'not-a-date' },
    });
    const res = createMockRes();

    await getSettlementReports(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.commissionSettlement.findMany).mockRejectedValue(new Error('Settlement query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getSettlementReports(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('getWalletLedger', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
  });

  it('credits paid-order item sales (subtotal − discount) and a payables brought-forward', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'order-1',
        storeId: 'store-a',
        createdAt: new Date('2026-07-15T10:00:00'),
        orderMode: 'TAKEAWAY',
        paymentMethod: 'PAYHERE',
        subtotal: 500,
        discount: 0,
        store: { name: 'Store A' },
      },
    ] as never);
    (prisma.order.groupBy as any).mockResolvedValue([
      {
        orderMode: 'TAKEAWAY',
        paymentMethod: 'PAYHERE',
        _sum: { total: 80, subtotal: 80, discount: 0, loyaltyDiscount: 0 },
      },
    ]);
    vi.mocked(prisma.walletTransaction.findMany).mockResolvedValue([] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { storeId: 'store-a', from: '2026-07-01', to: '2026-07-31' },
    });
    const res = createMockRes();

    await getWalletLedger(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        ledger: [
          expect.objectContaining({
            transactionType: 'Order Credits (Daily Total)',
            branchName: 'Store A',
            debit: 0,
            credit: 500,
            orderCount: 1,
            runningBalance: 580,
          }),
        ],
        count: 1,
        closingBalance: 580,
        broughtForward: 80,
        meta: expect.objectContaining({ from: '2026-07-01', to: '2026-07-31' }),
      }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('does not credit delivery or convenience fees included in order.total', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'order-1',
        storeId: 'store-a',
        createdAt: new Date('2026-07-15T10:00:00'),
        orderMode: 'DELIVERY',
        paymentMethod: 'PAYHERE',
        subtotal: 400,
        discount: 0,
        store: { name: 'Store A' },
      },
    ] as never);
    vi.mocked(prisma.walletTransaction.findMany).mockResolvedValue([
      {
        id: 'txn-1',
        storeId: 'store-a',
        orderId: 'order-1',
        type: 'ORDER_PAYMENT',
        amount: 43634, // order.total including fees — must not be used
        createdAt: new Date('2026-07-15T10:00:00'),
        store: { name: 'Store A' },
        reference: null,
        paymentRef: null,
        description: null,
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { storeId: 'store-a', from: '2026-07-01', to: '2026-07-31' },
    });
    const res = createMockRes();

    await getWalletLedger(req, res, next);

    const data = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data as {
      ledger: Array<{ credit: number; runningBalance: number }>;
      closingBalance: number;
    };
    expect(data.ledger[0]?.credit).toBe(400);
    expect(data.closingBalance).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('records payout and commission settlement debits as individual rows with a running balance', async () => {
    (prisma.walletTransaction.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: unknown) => {
        const a = args as { select?: unknown };
        if (a.select) return [] as never;
        return [
          {
            id: 'txn-1',
            storeId: 'store-a',
            orderId: null,
            type: 'PAYOUT',
            amount: -20000, // -200 LKR
            createdAt: new Date('2026-07-10T10:00:00'),
            store: { name: 'Store A' },
            reference: 'PAYOUT-1',
            paymentRef: null,
            description: 'Payout to bank',
          },
        ] as never;
      },
    );
    (prisma.commissionSettlement.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: unknown) => {
        const a = args as { select?: unknown };
        if (a.select) return [] as never;
        return [
          {
            id: 's1',
            storeId: 'store-a',
            statementRef: 'SETTLE-1',
            totalCommission: 5000, // 50 LKR
            platformPaybackAmount: 0,
            createdAt: new Date('2026-07-12T10:00:00'),
            periodFrom: new Date('2026-07-01'),
            periodTo: new Date('2026-07-15'),
            store: { name: 'Store A' },
          },
        ] as never;
      },
    );

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { storeId: 'store-a', from: '2026-07-01', to: '2026-07-31' },
    });
    const res = createMockRes();

    await getWalletLedger(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        ledger: [
          expect.objectContaining({
            transactionType: 'Branch Payout (Outflow)',
            referenceId: 'PAYOUT-1',
            debit: 200,
            credit: 0,
            runningBalance: -200,
          }),
          expect.objectContaining({
            transactionType: 'Commission Settlement (Outflow)',
            referenceId: 'SETTLE-1',
            debit: 50,
            credit: 0,
            runningBalance: -250,
          }),
        ],
        count: 2,
        closingBalance: -250,
        broughtForward: 0,
        meta: expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
      }),
    });
  });

  it('rejects wallet ledger date ranges wider than 92 days', async () => {
    const errNext = createMockNext();
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { from: '2026-01-01', to: '2026-05-01' },
    });
    const res = createMockRes();

    await getWalletLedger(req, res, errNext);

    expect(errNext).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('returns a zero balance ledger when there are no transactions', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getWalletLedger(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        ledger: [],
        count: 0,
        closingBalance: 0,
        broughtForward: 0,
        meta: expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
      }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards validation errors for a malformed date', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { from: 'not-a-date' },
    });
    const res = createMockRes();

    await getWalletLedger(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.walletTransaction.findMany).mockRejectedValue(new Error('Ledger query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getWalletLedger(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
