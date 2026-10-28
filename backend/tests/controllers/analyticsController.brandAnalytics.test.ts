import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';
import { createAnalyticsPrismaMock, resetAnalyticsPrismaDefaults } from '../helpers/analyticsPrisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: createAnalyticsPrismaMock(),
}));

import { getBrandAnalytics } from '../../src/controllers/analyticsController';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';

/** A single PAYHERE delivery order used to exercise the commission/fee math. */
function makeDeliveryOrder(storeId: string, createdAt: Date) {
  return {
    total: 1265,
    subtotal: 1000,
    discount: 0,
    loyaltyDiscount: 0,
    deliveryFee: 200,
    convenientFee: 65,
    orderMode: 'DELIVERY',
    paymentMethod: 'PAYHERE',
    createdAt,
    storeId,
    platform: 0,
  };
}

function mockOrderFindManyWithSingleOrder(order: ReturnType<typeof makeDeliveryOrder>) {
  (prisma.order.findMany as any).mockImplementation(async (args: unknown) => {
    const select = (args as { select?: Record<string, unknown> })?.select ?? {};
    if ('platform' in select) return [order] as never; // periodOrders
    if ('subtotal' in select) return [order] as never; // monthlyBaseOrders
    return [] as never;
  });
}

function mockOrderAggregateForBrand() {
  (prisma.order.aggregate as any).mockImplementation(async (args: unknown) => {
    const sum = (args as { _sum?: Record<string, unknown> })?._sum ?? {};
    if ('deliveryFee' in sum) return { _sum: { deliveryFee: 200 } } as never;
    if ('convenientFee' in sum) return { _sum: { convenientFee: 65 } } as never;
    return { _sum: { total: 1265 }, _count: { id: 1 } } as never;
  });
}

function mockOrderGroupByForBrand() {
  (prisma.order.groupBy as any).mockImplementation(async (args: unknown) => {
    const { by, where } = args as { by?: string[]; where?: { orderMode?: string } };
    if (by?.includes('storeId') && where?.orderMode === 'DELIVERY') {
      return [{ storeId: 'store-a', _count: { id: 1 } }] as never;
    }
    if (by?.includes('storeId')) {
      return [{ storeId: 'store-a', _sum: { total: 0 } }] as never;
    }
    return [] as never;
  });
}

describe('getBrandAnalytics', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
  });

  it('computes brand-wide KPI cards and per-branch performance from paid orders', async () => {
    const now = new Date();
    const order = makeDeliveryOrder('store-a', now);

    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-a', name: 'Bing Chun - Nugegoda', deliveryEnabled: true },
    ] as never);
    mockOrderFindManyWithSingleOrder(order);
    mockOrderAggregateForBrand();
    mockOrderGroupByForBrand();

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getBrandAnalytics(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        kpiCards: expect.objectContaining({
          grossSales: 1265,
          totalOrders: 1,
          totalCups: 0,
          totalDeliveryRevenue: 200,
          totalConvenienceRevenue: 65,
          gatewayFee: 24.035,
          commissionFee: 65,
          grossAfterFees: 1175.965,
        }),
        branchPerformance: [
          expect.objectContaining({
            storeId: 'store-a',
            tier: 'top',
            totalOrders: 1,
            grossSales: 1265,
            commission: 65,
            netTakeHome: 1175.965,
            growthPercent: 100,
            deliveryPercent: 100,
          }),
        ],
        stores: [
          expect.objectContaining({ id: 'store-a', deliveryEnabled: true, tier: 'top' }),
        ],
        kpiComparison: expect.objectContaining({
          grossSales: expect.objectContaining({ current: 1265, changePercent: expect.any(Number) }),
        }),
        revenueBreakdown: expect.objectContaining({
          delivery: 1265,
          pickup: 0,
        }),
        orderStatus: expect.objectContaining({
          completed: expect.any(Number),
          preparing: expect.any(Number),
          pending: expect.any(Number),
          cancelled: expect.any(Number),
        }),
        salesOverview: expect.arrayContaining([
          expect.objectContaining({
            revenue: expect.any(Number),
            orders: expect.any(Number),
            discount: expect.any(Number),
          }),
        ]),
      }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns zeroed KPIs and empty collections when there are no active stores or orders', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getBrandAnalytics(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        kpiCards: expect.objectContaining({
          grossSales: 0,
          totalOrders: 0,
          totalDeliveryRevenue: 0,
          totalConvenienceRevenue: 0,
          gatewayFee: 0,
          commissionFee: 0,
          grossAfterFees: 0,
        }),
        branchPerformance: [],
        topProducts: [],
        leastProducts: [],
        topProductCategories: [],
        stores: [],
      }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('applies custom date filters and rejects an invalid custom date range', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'custom', from: '2026-07-20', to: '2026-07-01' },
    });
    const res = createMockRes();

    await getBrandAnalytics(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(400);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid custom date range');
    expect(res.json).not.toHaveBeenCalled();
  });

  it('forwards validation errors for an unsupported period value', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'decade' },
    });
    const res = createMockRes();

    await getBrandAnalytics(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.store.findMany).mockRejectedValue(new Error('Store query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getBrandAnalytics(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
