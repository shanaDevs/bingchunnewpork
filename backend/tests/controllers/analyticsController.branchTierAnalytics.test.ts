import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';
import { createAnalyticsPrismaMock, resetAnalyticsPrismaDefaults } from '../helpers/analyticsPrisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: createAnalyticsPrismaMock(),
}));

import { getBranchTierAnalytics } from '../../src/controllers/analyticsController';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';

describe('getBranchTierAnalytics', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
  });

  it('computes kpiCards and per-branch order-mode splits for the requested tier', async () => {
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-a', name: 'Store A', deliveryEnabled: true },
    ] as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        total: 1000,
        orderMode: 'DELIVERY',
        deliveryFee: 150,
        paymentMethod: 'CARD',
        createdAt: new Date(),
        storeId: 'store-a',
        platform: 1,
        userId: 'user-1',
        guestPhone: null,
      },
      {
        total: 500,
        orderMode: 'TAKEAWAY',
        deliveryFee: 0,
        paymentMethod: 'CASH_AT_COUNTER',
        createdAt: new Date(),
        storeId: 'store-a',
        platform: 0,
        userId: null,
        guestPhone: '0771234567',
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month', tier: 'top' },
    });
    const res = createMockRes();

    await getBranchTierAnalytics(req, res, next);

    expect(prisma.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deliveryEnabled: true }) }),
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        tier: 'top',
        kpiCards: expect.objectContaining({
          grossSales: 1500,
          totalOrders: 2,
          deliveryOrders: 1,
          pickupOrders: 1,
          totalDeliveryRevenue: 150,
        }),
        kpiComparison: expect.objectContaining({
          grossSales: expect.objectContaining({ current: 1500 }),
        }),
        revenueBreakdown: { delivery: 1000, pickup: 500 },
        orderStatus: expect.objectContaining({
          completed: expect.any(Number),
          preparing: expect.any(Number),
          pending: expect.any(Number),
          cancelled: expect.any(Number),
        }),
        salesOverview: expect.any(Array),
        branchPerformance: [
          expect.objectContaining({
            storeId: 'store-a',
            totalOrders: 2,
            grossSales: 1500,
            webOrders: 1,
            mobileOrders: 1,
            newCustomers: 2,
            loyalCustomers: 0,
          }),
        ],
      }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns empty default shapes when no stores match the tier', async () => {
    vi.mocked(prisma.store.findMany).mockResolvedValue([] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month', tier: 'top' },
    });
    const res = createMockRes();

    await getBranchTierAnalytics(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        tier: 'top',
        stores: [],
        branchPerformance: [],
        branchDeliveryPickup: [],
        orderSummaryByBranch: [],
        topProducts: [],
        leastProducts: [],
        topProductCategories: [],
      }),
    });
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown tier value', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month', tier: 'premium' },
    });
    const res = createMockRes();

    await getBranchTierAnalytics(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects an invalid custom date range', async () => {
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-a', name: 'Store A', deliveryEnabled: true },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'custom', from: '2026-07-20', to: '2026-07-01' },
    });
    const res = createMockRes();

    await getBranchTierAnalytics(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(400);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.store.findMany).mockRejectedValue(new Error('Store query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getBranchTierAnalytics(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
