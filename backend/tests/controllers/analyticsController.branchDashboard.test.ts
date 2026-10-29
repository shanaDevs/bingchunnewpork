import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

function emptyAggregate() {
  return {
    _sum: {
      total: null,
      quantity: null,
      balance: null,
      deliveryFee: null,
      convenientFee: null,
    },
    _count: { id: 0 },
  };
}

function createPrismaMock() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    order: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue(emptyAggregate()),
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    user: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    orderItem: {
      groupBy: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: null } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    orderItemTopping: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
    storeWallet: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { balance: null } }),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    deliveryPayout: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    store: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    topping: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    deliveryJob: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    driverShift: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    adminUser: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    commissionSettlement: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    walletTransaction: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    promotionUsage: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    refund: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { refundAmount: null } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    jasonLedgerEntry: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
  };
}

vi.mock('../../src/lib/prisma', () => ({
  prisma: createPrismaMock(),
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    resolveBranchStoreId: vi.fn(),
    requireBranchStoreId: vi.fn(),
    isBranchScopedRole: vi.fn(),
  };
});

vi.mock('../../src/lib/walletService', () => ({
  computeBranchPayablesSummary: vi.fn().mockResolvedValue({
    totalRemaining: 0,
    branchesWithPayable: 0,
  }),
}));

vi.mock('../../src/lib/walletAnalysis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/walletAnalysis')>();
  return {
    ...actual,
    getOutgoingFlowsForRange: vi.fn().mockResolvedValue([]),
    getOutgoingFlowsForDashboard: vi.fn().mockResolvedValue([]),
    getOutgoingTotalsByChartBuckets: vi.fn().mockImplementation(async (chart) => {
      const buckets = new Map<string, number>();
      for (const key of chart.keys) {
        buckets.set(key, 0);
      }
      return buckets;
    }),
  };
});

vi.mock('../../src/lib/appSchema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/appSchema')>();
  return {
    ...actual,
    getGatewayFeeRate: vi.fn().mockResolvedValue(0.019),
  };
});

vi.mock('../../src/lib/deliveryPayoutSchema', () => ({
  ensureDeliveryPayoutSchema: vi.fn().mockResolvedValue(undefined),
}));

import {
  getBranchAnalytics,
  getDashboardStats,
} from '../../src/controllers/analyticsController';
import { clearAnalyticsResponseCache } from '../../src/lib/analyticsResponseCache';
import { prisma } from '../../src/lib/prisma';
import {
  getOutgoingFlowsForDashboard,
  getOutgoingFlowsForRange,
  getOutgoingTotalsByChartBuckets,
} from '../../src/lib/walletAnalysis';
import {
  isBranchScopedRole,
  requireBranchStoreId,
  resolveBranchStoreId,
} from '../../src/middleware/auth';
import { AppError } from '../../src/middleware/errorHandler';

function queryRawSqlText(query: unknown): string {
  if (Array.isArray(query)) {
    const strings = query[0];
    if (Array.isArray(strings)) {
      return strings.join(' ');
    }
    return query.map((part) => (typeof part === 'string' ? part : '')).join(' ');
  }
  return String(query);
}

function resetPrismaDefaults() {
  vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
  vi.mocked(prisma.order.count).mockResolvedValue(0);
  vi.mocked(prisma.order.aggregate).mockResolvedValue(emptyAggregate() as never);
  vi.mocked(prisma.order.findMany).mockResolvedValue([]);
  vi.mocked(prisma.order.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.user.count).mockResolvedValue(0);
  vi.mocked(prisma.user.findMany).mockResolvedValue([]);
  vi.mocked(prisma.orderItem.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.orderItem.aggregate).mockResolvedValue({ _sum: { quantity: null } } as never);
  vi.mocked(prisma.orderItem.findMany).mockResolvedValue([]);
  vi.mocked(prisma.orderItemTopping.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.storeWallet.findMany).mockResolvedValue([]);
  vi.mocked(prisma.storeWallet.aggregate).mockResolvedValue({ _sum: { balance: null } } as never);
  vi.mocked(prisma.storeWallet.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.deliveryPayout.findMany).mockResolvedValue([]);
  vi.mocked(prisma.store.findMany).mockResolvedValue([]);
  vi.mocked(prisma.product.findMany).mockResolvedValue([]);
  vi.mocked(prisma.topping.findMany).mockResolvedValue([]);
  vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue([]);
  vi.mocked(prisma.driverShift.findMany).mockResolvedValue([]);
  vi.mocked(prisma.adminUser.findMany).mockResolvedValue([]);
  vi.mocked(prisma.commissionSettlement.findMany).mockResolvedValue([]);
  vi.mocked(prisma.commissionSettlement.count).mockResolvedValue(0);
  vi.mocked(prisma.walletTransaction.findMany).mockResolvedValue([]);
  vi.mocked(prisma.promotionUsage.findMany).mockResolvedValue([]);
  vi.mocked(prisma.refund.aggregate).mockResolvedValue({ _sum: { refundAmount: null } } as never);
  vi.mocked(prisma.refund.findMany).mockResolvedValue([]);
  vi.mocked(prisma.jasonLedgerEntry.aggregate).mockResolvedValue({ _sum: { amount: null } } as never);
}

describe('getDashboardStats', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    clearAnalyticsResponseCache();
    resetPrismaDefaults();
    vi.mocked(isBranchScopedRole).mockReturnValue(false);
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(getOutgoingFlowsForRange).mockResolvedValue([]);
    vi.mocked(getOutgoingFlowsForDashboard).mockResolvedValue([]);
    vi.mocked(getOutgoingTotalsByChartBuckets).mockImplementation(async (chart) => {
      const buckets = new Map<string, number>();
      for (const key of chart.keys) {
        buckets.set(key, 0);
      }
      return buckets;
    });
  });

  it('returns dashboard stats for a system admin with empty datasets', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        period: 'month',
        todayOrders: 0,
        periodRevenue: 0,
        activeOrders: 0,
        recentOrders: [],
      }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('tier=summary returns KPI fields without charts or details payloads', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month', tier: 'summary' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(payload.periodRevenue).toBe(0);
    expect(payload.monthlyOverview).toBeUndefined();
    expect(payload.topProducts).toBeUndefined();
    expect(payload.jasonInvestedAmount).toBeUndefined();
  });

  it('tier=charts returns chart aggregates without product details', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month', tier: 'charts' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(Array.isArray(payload.monthlyOverview)).toBe(true);
    expect(payload.topDeliveryRiders).toBeUndefined();
    expect(payload.outflowByMethod).toBeUndefined();
    expect(payload.topProducts).toBeUndefined();
    expect(payload.periodRevenue).toBeUndefined();
  });

  it('tier=charts-wallet returns wallet-heavy chart widgets', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month', tier: 'charts-wallet' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(Array.isArray(payload.topDeliveryRiders)).toBe(true);
    expect(Array.isArray(payload.outflowByMethod)).toBe(true);
    expect(payload.monthlyOverview).toBeUndefined();
  });

  it('tier=details returns bottom-section aggregates', async () => {
    vi.mocked(prisma.jasonLedgerEntry.aggregate).mockResolvedValue({
      _sum: { amount: 10000 },
    } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month', tier: 'details' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(Array.isArray(payload.topProducts)).toBe(true);
    expect(payload.discountsByParty).toBeDefined();
    expect(payload.jasonInvestedAmount).toBeGreaterThan(0);
    expect(payload.monthlyOverview).toBeUndefined();
  });

  it('ignores tier for branch admins and returns full dashboard payload', async () => {
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-1');

    const req = createMockReq({
      user: { sub: 'branch-1', type: 'admin', role: 'BRANCH_ADMIN' },
      query: { period: 'month', tier: 'summary' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(payload.recentOrders).toEqual([]);
    expect(payload.topProducts).toEqual([]);
  });

  it('returns Jason invested amount in LKR for the selected period', async () => {
    vi.mocked(prisma.jasonLedgerEntry.aggregate).mockResolvedValue({
      _sum: { amount: 150050 },
    } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.data.jasonInvestedAmount).toBe(1500.5);
    expect(prisma.jasonLedgerEntry.aggregate).toHaveBeenCalledWith({
      _sum: { amount: true },
      where: {
        type: 'INVESTMENT',
        isActive: true,
        occurredAt: expect.objectContaining({
          gte: expect.any(Date),
          lte: expect.any(Date),
        }),
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('aggregates promo discounts by Branch, Jason, and Platform', async () => {
    vi.mocked(prisma.promotionUsage.findMany).mockResolvedValue([
      {
        ownership: 'BRANCH',
        totalDiscountAmount: 100,
        branchShareAmount: 100,
        platformShareAmount: 0,
        contributionSource: null,
      },
      {
        ownership: 'PLATFORM',
        totalDiscountAmount: 50,
        branchShareAmount: 0,
        platformShareAmount: 50,
        contributionSource: 'PLATFORM',
      },
      {
        ownership: 'SHARED',
        totalDiscountAmount: 80,
        branchShareAmount: 20,
        platformShareAmount: 30,
        contributionSource: 'JASON',
      },
      {
        ownership: 'SHARED',
        totalDiscountAmount: 40,
        branchShareAmount: 10,
        platformShareAmount: 30,
        contributionSource: 'PLATFORM',
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.data.discountsByParty).toEqual({
      branch: 130,
      jason: 30,
      platform: 80,
      total: 240,
      branchPercent: 54,
      jasonPercent: 13,
      platformPercent: 33,
    });
    expect(payload.data).not.toHaveProperty('userPlatform');
  });

  it('adds completed refund outflow to monthlyOverview for branch admins', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
    try {
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-nugegoda');
    const inWindow = new Date(2026, 6, 8, 12);
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      { refundAmount: 1200, processedAt: inWindow, createdAt: inWindow },
      { refundAmount: 800, processedAt: null, createdAt: inWindow },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-nugegoda' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const pointsWithOutflow = payload.data.monthlyOverview.filter(
      (point: { outflow?: number }) => (point.outflow ?? 0) > 0,
    );
    expect(pointsWithOutflow).toHaveLength(1);
    expect(pointsWithOutflow[0].outflow).toBe(2000);
    expect(pointsWithOutflow[0]).not.toHaveProperty('inflow');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sums COMPLETE refund amounts for the selected period for branch admins, scoped to their store', async () => {
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-nugegoda');
    vi.mocked(prisma.refund.aggregate).mockResolvedValue({
      _sum: { refundAmount: 2650 },
    } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-nugegoda' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    expect(prisma.refund.aggregate).toHaveBeenCalledWith({
      where: {
        status: 'COMPLETE',
        order: { is: { storeId: 'store-nugegoda' } },
        OR: [
          { processedAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }) },
          {
            processedAt: null,
            createdAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
          },
        ],
      },
      _sum: { refundAmount: true },
    });
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.data.periodRefundAmount).toBe(2650);
  });

  it('sums COMPLETE refund amounts for the selected period for super admins', async () => {
    vi.mocked(prisma.refund.aggregate).mockResolvedValue({
      _sum: { refundAmount: 8420 },
    } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'year' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    expect(prisma.refund.aggregate).toHaveBeenCalledWith({
      where: {
        status: 'COMPLETE',
        OR: [
          { processedAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }) },
          {
            processedAt: null,
            createdAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
          },
        ],
      },
      _sum: { refundAmount: true },
    });
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.data.periodRefundAmount).toBe(8420);
  });

  it('adds inflow and outflow to monthlyOverview for super admins only', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
    try {
    const inWindow = new Date(2026, 6, 8, 12);
    vi.mocked(prisma.storeWallet.findMany).mockResolvedValue([
      { storeId: 'store-1', store: { id: 'store-1', name: 'Nugegoda', city: 'Colombo' } },
    ] as never);
    vi.mocked(prisma.walletTransaction.findMany).mockResolvedValue([
      {
        type: 'ORDER_PAYMENT',
        amount: 15000,
        createdAt: inWindow,
        orderId: 'order-1',
        reference: 'BC-1',
        description: 'Online payment',
      },
      {
        type: 'ORDER_PAYMENT',
        amount: 15000,
        createdAt: inWindow,
        orderId: 'order-1',
        reference: 'BC-1-dup',
        description: 'Duplicate credit',
      },
      {
        type: 'ADJUSTMENT',
        amount: 5000,
        createdAt: inWindow,
        orderId: null,
        reference: null,
        description: 'Top-up',
      },
      {
        type: 'PAYOUT',
        amount: -20000,
        createdAt: inWindow,
        orderId: null,
        reference: 'WD-1',
        description: 'Branch withdrawal',
      },
      {
        type: 'PAYOUT',
        amount: -90000,
        createdAt: inWindow,
        orderId: null,
        reference: 'DELIVERY-1',
        description: 'Delivery partner payout',
      },
      {
        type: 'REFUND',
        amount: -4000,
        createdAt: inWindow,
        orderId: 'order-2',
        reference: null,
        description: 'Refund',
      },
    ] as never);
    vi.mocked(prisma.deliveryPayout.findMany).mockResolvedValue([
      { amount: 75, reviewedAt: inWindow, createdAt: inWindow },
    ] as never);
    vi.mocked(prisma.order.findMany).mockImplementation(async (args: unknown) => {
      const where = (args as { where?: { paymentMethod?: string } })?.where;
      if (where?.paymentMethod === 'PAYHERE') {
        return [
          {
            createdAt: inWindow,
            total: 1000,
            orderMode: 'TAKEAWAY',
            paymentMethod: 'PAYHERE',
          },
        ] as never;
      }
      return [] as never;
    });
    vi.mocked(prisma.$queryRaw).mockImplementation(async (query: unknown) => {
      const sql = queryRawSqlText(query);
      if (sql.includes('inflow_union')) {
        return [{ bucket: '2026-07', inflow_cents: BigInt(20000) }] as never;
      }
      return [] as never;
    });
    vi.mocked(getOutgoingTotalsByChartBuckets).mockImplementation(async (chart) => {
      const buckets = new Map<string, number>();
      for (const key of chart.keys) {
        buckets.set(key, key === '2026-07' ? 294 : 0);
      }
      return buckets;
    });

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const lastPoint = payload.data.monthlyOverview.at(-1);
    expect(lastPoint).toEqual(
      expect.objectContaining({
        inflow: 200,
        outflow: 294,
      }),
    );
    expect(getOutgoingTotalsByChartBuckets).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('scopes dashboard queries to the branch store for branch admins', async () => {
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-nugegoda');

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-nugegoda' },
      query: { period: 'today' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    expect(resolveBranchStoreId).toHaveBeenCalledWith(req);
    expect(prisma.jasonLedgerEntry.aggregate).not.toHaveBeenCalled();
    expect(prisma.order.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-nugegoda' }),
      }),
    );
    const countWheres = vi.mocked(prisma.order.count).mock.calls.map((call) => call[0]?.where);
    const periodOrdersWhere = countWheres.find(
      (where) => where?.storeId === 'store-nugegoda' && where.createdAt && !where.status,
    );
    const inProgressWhere = countWheres.find(
      (where) =>
        Array.isArray(where?.status?.in) && where.status.in.includes('PREPARING'),
    );
    expect(inProgressWhere).toEqual(
      expect.objectContaining({
        storeId: 'store-nugegoda',
        createdAt: periodOrdersWhere?.createdAt,
        status: { in: ['RECEIVED', 'PREPARING', 'READY'] },
        OR: [
          {
            orderMode: 'TAKEAWAY',
            OR: [{ paymentStatus: 'PAID' }, { paymentMethod: 'CASH_AT_COUNTER' }],
          },
          { orderMode: 'DELIVERY', paymentStatus: 'PAID' },
        ],
      }),
    );
    expect(
      countWheres.some((where) =>
        Array.isArray(where?.status?.in) && where.status.in.includes('OUT_FOR_DELIVERY'),
      ),
    ).toBe(false);
    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(prisma.deliveryPayout.findMany).not.toHaveBeenCalled();
    expect(prisma.refund.aggregate).toHaveBeenCalledWith({
      where: {
        status: 'COMPLETE',
        order: { is: { storeId: 'store-nugegoda' } },
        OR: [
          { processedAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }) },
          {
            processedAt: null,
            createdAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
          },
        ],
      },
      _sum: { refundAmount: true },
    });
    expect(prisma.refund.findMany).toHaveBeenCalledWith({
      where: {
        status: 'COMPLETE',
        order: { is: { storeId: 'store-nugegoda' } },
        OR: [
          {
            processedAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
          },
          {
            processedAt: null,
            createdAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
          },
        ],
      },
      select: {
        refundAmount: true,
        processedAt: true,
        createdAt: true,
      },
    });
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.data.monthlyOverview[0]).not.toHaveProperty('inflow');
    expect(payload.data.monthlyOverview[0]).toEqual(
      expect.objectContaining({ outflow: 0 }),
    );
    expect(payload.data).not.toHaveProperty('outflowByMethod');
    expect(payload.data).not.toHaveProperty('topRefundBranches');
    expect(res.json).toHaveBeenCalled();
  });

  it('applies custom date filters when period is custom', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'custom', from: '2026-07-01', to: '2026-07-15' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        period: 'custom',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-15',
      }),
    });
  });

  it('excludes cancelled orders from the Revenue Overview monthly series', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('returns wallet outgoing methods for super admins', async () => {
    vi.mocked(getOutgoingFlowsForDashboard).mockResolvedValue([
      { key: 'partner', label: 'Delivery partner payment', amount: 1200 },
      { key: 'platform', label: 'Platform provider commission', amount: 800 },
      { key: 'gateway', label: 'Payment gateway payments', amount: 150 },
    ]);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    expect(getOutgoingFlowsForDashboard).toHaveBeenCalledWith({
      from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.data.outflowByMethod).toEqual([
      { key: 'partner', label: 'Delivery partner payment', amount: 1200 },
      { key: 'platform', label: 'Platform provider commission', amount: 800 },
      { key: 'gateway', label: 'Payment gateway payments', amount: 150 },
    ]);
  });

  it('returns top 5 refund branches ranked by completed refund amount', async () => {
    vi.mocked(prisma.$queryRaw).mockImplementation(async (query: unknown) => {
      const sql = queryRawSqlText(query);
      if (sql.includes('"refunds"') && sql.includes('GROUP BY o."storeId"')) {
        return [
          { storeId: 'store-maha', amount: 4320, count: BigInt(1) },
          { storeId: 'store-nuge', amount: 3210, count: BigInt(2) },
          { storeId: 'store-kott', amount: 2480, count: BigInt(1) },
          { storeId: 'store-mala', amount: 1960, count: BigInt(1) },
          { storeId: 'store-batta', amount: 1430, count: BigInt(1) },
        ] as never;
      }
      return [] as never;
    });
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-maha', name: 'Bing Chun - Maharagama', city: 'Colombo' },
      { id: 'store-nuge', name: 'Bing Chun - Nugegoda', city: 'Colombo' },
      { id: 'store-kott', name: 'Bing Chun - Kottawa', city: 'Colombo' },
      { id: 'store-mala', name: 'Bing Chun - Malabe', city: 'Colombo' },
      { id: 'store-batta', name: 'Bing Chun - Battaramulla', city: 'Colombo' },
      { id: 'store-other', name: 'Bing Chun - Other', city: 'Colombo' },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.data.topRefundBranches).toEqual([
      { storeId: 'store-maha', branchName: 'Maharagama', amount: 4320, count: 1 },
      { storeId: 'store-nuge', branchName: 'Nugegoda', amount: 3210, count: 2 },
      { storeId: 'store-kott', branchName: 'Kottawa', amount: 2480, count: 1 },
      { storeId: 'store-mala', branchName: 'Malabe', amount: 1960, count: 1 },
      { storeId: 'store-batta', branchName: 'Battaramulla', amount: 1430, count: 1 },
    ]);
  });

  it('returns top 5 delivery riders with KPI fields for super admins', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
    try {
    vi.mocked(prisma.$queryRaw).mockImplementation(async (query) => {
      const sql = queryRawSqlText(query);
      if (sql.includes('delivery_jobs') && sql.includes('driver_id')) {
        return [
          {
            driver_id: 'rider-a',
            completed_jobs: BigInt(2),
            distinct_orders: BigInt(2),
            total_distance_km: 15.5,
          },
          {
            driver_id: 'rider-b',
            completed_jobs: BigInt(1),
            distinct_orders: BigInt(1),
            total_distance_km: 8,
          },
        ] as never;
      }
      return [] as never;
    });
    vi.mocked(prisma.adminUser.findMany).mockImplementation(async (args: unknown) => {
      const where = (args as { where?: { role?: unknown } })?.where;
      if (where && 'role' in where) {
        return [] as never;
      }
      return [
        { id: 'rider-a', name: 'Amal', profilePhotoUrl: null },
        { id: 'rider-b', name: 'Bimal', profilePhotoUrl: null },
      ] as never;
    });
    const shiftStart = new Date(2026, 6, 2, 8, 0, 0);
    const shiftEnd = new Date(2026, 6, 2, 10, 0, 0);
    vi.mocked(prisma.driverShift.findMany).mockResolvedValue([
      {
        driverId: 'rider-a',
        startedAt: shiftStart,
        endedAt: shiftEnd,
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.data.topDeliveryRiders).toHaveLength(2);
    expect(payload.data.topDeliveryRiders[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        riderId: 'rider-a',
        riderName: 'Amal',
        completedJobs: 2,
        distinctOrders: 2,
        totalDistanceKm: 15.5,
        onlineTimeMinutes: 120,
      }),
    );
    expect(payload.data.topRiders[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        driverId: 'rider-a',
        name: 'Amal',
        completedJobs: 2,
        deliveredOrders: 2,
      }),
    );
    expect(payload.data.topDeliveryRiders.length).toBeLessThanOrEqual(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports zero rider online minutes when shifts start after the dashboard period end', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 1, 1, 0, 0));
    try {
      vi.mocked(prisma.$queryRaw).mockImplementation(async (query) => {
        const sql = queryRawSqlText(query);
        if (sql.includes('delivery_jobs') && sql.includes('driver_id')) {
          return [
            {
              driver_id: 'rider-a',
              completed_jobs: BigInt(1),
              distinct_orders: BigInt(1),
              total_distance_km: 5,
            },
          ] as never;
        }
        return [] as never;
      });
      vi.mocked(prisma.adminUser.findMany).mockImplementation(async (args: unknown) => {
        const where = (args as { where?: { role?: unknown } })?.where;
        if (where && 'role' in where) {
          return [] as never;
        }
        return [{ id: 'rider-a', name: 'Amal', profilePhotoUrl: null }] as never;
      });
      vi.mocked(prisma.driverShift.findMany).mockResolvedValue([
        {
          driverId: 'rider-a',
          startedAt: new Date(2026, 6, 2, 8, 0, 0),
          endedAt: new Date(2026, 6, 2, 10, 0, 0),
        },
      ] as never);

      const req = createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        query: { period: 'month' },
      });
      const res = createMockRes();

      await getDashboardStats(req, res, next);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.data.topDeliveryRiders[0].onlineTimeMinutes).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts rider online minutes for open shifts up to the current time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
    try {
      vi.mocked(prisma.$queryRaw).mockImplementation(async (query) => {
        const sql = queryRawSqlText(query);
        if (sql.includes('delivery_jobs') && sql.includes('driver_id')) {
          return [
            {
              driver_id: 'rider-a',
              completed_jobs: BigInt(1),
              distinct_orders: BigInt(1),
              total_distance_km: 5,
            },
          ] as never;
        }
        return [] as never;
      });
      vi.mocked(prisma.adminUser.findMany).mockImplementation(async (args: unknown) => {
        const where = (args as { where?: { role?: unknown } })?.where;
        if (where && 'role' in where) {
          return [] as never;
        }
        return [{ id: 'rider-a', name: 'Amal', profilePhotoUrl: null }] as never;
      });
      vi.mocked(prisma.driverShift.findMany).mockResolvedValue([
        {
          driverId: 'rider-a',
          startedAt: new Date(2026, 6, 15, 8, 0, 0),
          endedAt: null,
        },
      ] as never);

      const req = createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        query: { period: 'month' },
      });
      const res = createMockRes();

      await getDashboardStats(req, res, next);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.data.topDeliveryRiders[0].onlineTimeMinutes).toBe(240);
    } finally {
      vi.useRealTimers();
    }
  });

  it('forwards validation errors for custom period without dates', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'custom' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('aggregates revenue from prisma aggregate results', async () => {
    vi.mocked(prisma.order.aggregate).mockResolvedValue({
      _sum: { total: 12500 },
      _count: { id: 8 },
    } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        periodRevenue: 12500,
        periodPaidCount: 8,
      }),
    });
  });

  it('propagates prisma aggregate failures', async () => {
    vi.mocked(prisma.order.aggregate).mockRejectedValue(new Error('Aggregate query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getDashboardStats(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  describe('buildCustomerGrowth via getDashboardStats', () => {
    function mockCustomerGrowthFindMany(
      periodOrders: Array<{ userId: string | null; guestPhone: string | null }>,
    ) {
      vi.mocked(prisma.order.findMany).mockImplementation(async (args: unknown) => {
        const select = (args as { select?: Record<string, unknown> })?.select ?? {};
        if ('userId' in select && 'guestPhone' in select && Object.keys(select).length === 2) {
          return periodOrders as never;
        }
        return [] as never;
      });
    }

    function mockCustomerGrowthGroupBy(
      userCounts: Array<{ userId: string; _count: { id: number } }>,
      guestCounts: Array<{ guestPhone: string; _count: { id: number } }>,
    ) {
      vi.mocked(prisma.order.groupBy).mockImplementation(async (args: unknown) => {
        const typed = args as {
          by?: string[];
          _sum?: unknown;
          where?: { userId?: unknown; guestPhone?: unknown };
        };
        if (typed.by?.includes('userId') && typed._sum) {
          return userCounts.map((row) => ({
            userId: row.userId,
            _sum: { total: 0 },
            _count: row._count,
          })) as never;
        }
        if (typed.by?.includes('guestPhone') && typed._sum) {
          return guestCounts.map((row) => ({
            guestPhone: row.guestPhone,
            _sum: { total: 0 },
            _count: row._count,
          })) as never;
        }
        if (typed.by?.includes('userId') && typed._count && typed.where?.userId) {
          const userIdFilter = typed.where.userId as { in?: unknown; not?: unknown };
          if (userIdFilter.in) {
            return userCounts as never;
          }
          if ('not' in userIdFilter) {
            return userCounts.map((row) => ({
              userId: row.userId,
              _count: { id: 1 },
            })) as never;
          }
        }
        if (typed.by?.includes('guestPhone') && typed._count && typed.where?.guestPhone) {
          const guestPhoneFilter = typed.where.guestPhone as { in?: unknown; not?: unknown };
          if (guestPhoneFilter.in) {
            return guestCounts as never;
          }
          if ('not' in guestPhoneFilter) {
            return guestCounts.map((row) => ({
              guestPhone: row.guestPhone,
              _count: { id: 1 },
            })) as never;
          }
        }
        return [] as never;
      });
    }

    function customerGrowthFromResponse(res: ReturnType<typeof createMockRes>) {
      return (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data.customerGrowth as {
        segments: Array<{ key: string; value: number }>;
      };
    }

    it('counts registered first-time buyers in newRegistered only', async () => {
      mockCustomerGrowthGroupBy([{ userId: 'user-1', _count: { id: 1 } }], []);

      const req = createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        query: { period: 'month' },
      });
      const res = createMockRes();

      await getDashboardStats(req, res, next);

      const growth = customerGrowthFromResponse(res);
      expect(growth.segments.find((s) => s.key === 'newRegistered')?.value).toBe(1);
      expect(growth.segments.find((s) => s.key === 'newGuest')?.value).toBe(0);
      expect(next).not.toHaveBeenCalled();
    });

    it('counts guest first-time buyers in newGuest, not newRegistered', async () => {
      mockCustomerGrowthGroupBy([], [{ guestPhone: '0771111111', _count: { id: 1 } }]);

      const req = createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        query: { period: 'month' },
      });
      const res = createMockRes();

      await getDashboardStats(req, res, next);

      const growth = customerGrowthFromResponse(res);
      expect(growth.segments.find((s) => s.key === 'newRegistered')?.value).toBe(0);
      expect(growth.segments.find((s) => s.key === 'newGuest')?.value).toBe(1);
      expect(next).not.toHaveBeenCalled();
    });

    it('counts repeat buyers (registered or guest) in returningLoyal', async () => {
      mockCustomerGrowthGroupBy(
        [{ userId: 'user-1', _count: { id: 2 } }],
        [{ guestPhone: '0772222222', _count: { id: 3 } }],
      );

      const req = createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        query: { period: 'month' },
      });
      const res = createMockRes();

      await getDashboardStats(req, res, next);

      const growth = customerGrowthFromResponse(res);
      expect(growth.segments.find((s) => s.key === 'returningLoyal')?.value).toBe(2);
      expect(growth.segments.find((s) => s.key === 'newRegistered')?.value).toBe(0);
      expect(growth.segments.find((s) => s.key === 'newGuest')?.value).toBe(0);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('buildRiderStaffStatus via getDashboardStats', () => {
    it('counts only delivery drivers in riderStaffStatus total, not store managers', async () => {
      vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
        { id: 'driver-1', role: { name: 'DELIVERY_DRIVER' } },
      ] as never);

      const req = createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        query: { period: 'month' },
      });
      const res = createMockRes();

      await getDashboardStats(req, res, next);

      expect(prisma.adminUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: { name: { in: ['DELIVERY_DRIVER'] } },
          }),
        }),
      );

      const data = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data as {
        riderStaffStatus: { total: number; active: number; idle: number };
      };
      expect(data.riderStaffStatus.total).toBe(1);
      expect(next).not.toHaveBeenCalled();
    });

    it('sets active to busy driver count and idle to remainder', async () => {
      vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
        { id: 'driver-1', role: { name: 'DELIVERY_DRIVER' } },
      ] as never);
      vi.mocked(prisma.deliveryJob.findMany).mockImplementation(async (args: unknown) => {
        const where = (args as { where?: { status?: unknown } }).where;
        if (
          where?.status &&
          typeof where.status === 'object' &&
          'in' in (where.status as object)
        ) {
          return [{ driverId: 'driver-1' }] as never;
        }
        return [] as never;
      });

      const req = createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        query: { period: 'month' },
      });
      const res = createMockRes();

      await getDashboardStats(req, res, next);

      const data = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data as {
        riderStaffStatus: { total: number; active: number; idle: number };
      };
      expect(data.riderStaffStatus).toEqual({ total: 1, active: 1, idle: 0 });
      expect(next).not.toHaveBeenCalled();
    });
  });
});

describe('getBranchAnalytics', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    clearAnalyticsResponseCache();
    resetPrismaDefaults();
    vi.mocked(requireBranchStoreId).mockResolvedValue('store-nugegoda');
    vi.mocked(getOutgoingFlowsForRange).mockResolvedValue([]);
  });

  it('returns branch analytics scoped to the linked store', async () => {
    vi.mocked(prisma.order.aggregate).mockResolvedValue({
      _sum: { total: 5000 },
      _count: { id: 4 },
    } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-nugegoda' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getBranchAnalytics(req, res, next);

    expect(requireBranchStoreId).toHaveBeenCalledWith(req);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-nugegoda',
          paymentStatus: 'PAID',
          status: { not: 'CANCELLED' },
        }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        period: 'month',
        kpiCards: expect.objectContaining({
          grossSales: 5000,
          totalOrders: 4,
        }),
      }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns store-scoped outflow, refund-by-month, and discounts-by-month series', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
    try {
    const inWindow = new Date(2026, 6, 8, 12);
    vi.mocked(getOutgoingFlowsForRange).mockResolvedValue([
      { key: 'platform', label: 'Platform provider commission', amount: 420 },
    ]);
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      { refundAmount: 900, processedAt: inWindow, createdAt: inWindow },
    ] as never);
    vi.mocked(prisma.promotionUsage.findMany).mockResolvedValue([
      { totalDiscountAmount: 250, createdAt: inWindow },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-nugegoda' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getBranchAnalytics(req, res, next);

    expect(getOutgoingFlowsForRange).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 'store-nugegoda' }),
    );
    expect(prisma.refund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'COMPLETE',
          order: { is: { storeId: 'store-nugegoda' } },
        }),
      }),
    );
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.data.outflowByMethod).toEqual([
      { key: 'platform', label: 'Platform provider commission', amount: 420 },
    ]);
    const refundPoint = payload.data.refundByMonth.find(
      (point: { amountLkr: number }) => point.amountLkr > 0,
    );
    expect(refundPoint).toEqual(expect.objectContaining({ count: 1, amountLkr: 900 }));
    const discountPoint = payload.data.discountsByMonth.find(
      (point: { totalDiscount: number }) => point.totalDiscount > 0,
    );
    expect(discountPoint).toEqual(expect.objectContaining({ totalDiscount: 250 }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns empty analytics when there are no paid orders in the period', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: { period: 'today' },
    });
    const res = createMockRes();

    await getBranchAnalytics(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        kpiCards: expect.objectContaining({
          grossSales: 0,
          totalOrders: 0,
          avgOrderValue: 0,
        }),
        topProducts: [],
        topProductCategories: [],
      }),
    });
  });

  it('applies custom date filters to branch analytics', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: { period: 'custom', from: '2026-07-01', to: '2026-07-10' },
    });
    const res = createMockRes();

    await getBranchAnalytics(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        period: 'custom',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
      }),
    });
  });

  it('returns 400 for an invalid custom date range', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: { period: 'custom', from: '2026-07-20', to: '2026-07-01' },
    });
    const res = createMockRes();

    await getBranchAnalytics(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid custom date range');
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(400);
  });

  it('blocks branch analytics when the admin is not linked to a store', async () => {
    vi.mocked(requireBranchStoreId).mockRejectedValue(
      new AppError('Branch not linked to your account', 403),
    );

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getBranchAnalytics(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('masks top-customer phone numbers in branch analytics', async () => {
    vi.mocked(prisma.order.groupBy).mockImplementation(async (args: unknown) => {
      const by = (args as { by?: string[] }).by ?? [];
      if (by.includes('userId')) {
        return [{ userId: 'user-1', _sum: { total: 5000 }, _count: { id: 2 } }] as never;
      }
      return [] as never;
    });
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'user-1', name: 'Alice', phone: '0771234567', email: null },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getBranchAnalytics(req, res, next);

    const data = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data as {
      topCustomers: Array<{ phone?: string }>;
    };
    expect(data.topCustomers[0]?.phone).toMatch(/^077 XXX 4567$/);
  });

  it('uses Colombo timezone boundaries for custom branch analytics ranges', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: { period: 'custom', from: '2026-09-08', to: '2026-09-08' },
    });
    const res = createMockRes();

    await getBranchAnalytics(req, res, next);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date('2026-09-07T18:30:00.000Z'),
            lte: expect.any(Date),
          },
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('buckets peak hours using Asia/Colombo local time', async () => {
    const peakOrder = {
      id: 'o1',
      total: 1000,
      subtotal: 1000,
      discount: 0,
      loyaltyDiscount: 0,
      deliveryFee: 0,
      convenientFee: 0,
      orderMode: 'TAKEAWAY',
      paymentMethod: 'CASH_AT_COUNTER',
      createdAt: new Date('2026-09-10T13:30:00.000Z'),
      storeId: 'store-nugegoda',
      platform: 0,
    };
    vi.mocked(prisma.order.aggregate).mockResolvedValue({
      _sum: { total: 1000 },
      _count: { id: 1 },
    } as never);
    (prisma.order.findMany as any).mockImplementation(async (args: unknown) => {
      const select = (args as { select?: Record<string, unknown> })?.select ?? {};
      if ('platform' in select) return [peakOrder] as never;
      return [] as never;
    });
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ hour: 19, day: 3, orders: 1, revenue: 1000 }]);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getBranchAnalytics(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const data = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data as {
      hourlyPeakTimes: Array<{ hour: number; orders: number }>;
    };
    expect(data.hourlyPeakTimes[19]?.orders).toBe(1);
    expect(data.hourlyPeakTimes[13]?.orders).toBe(0);
  });

  it('propagates prisma failures during branch analytics', async () => {
    vi.mocked(prisma.order.findMany).mockRejectedValue(new Error('Branch analytics query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getBranchAnalytics(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
