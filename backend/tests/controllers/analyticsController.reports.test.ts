import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';
import { createAnalyticsPrismaMock, resetAnalyticsPrismaDefaults } from '../helpers/analyticsPrisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: createAnalyticsPrismaMock(),
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    resolveBranchStoreId: vi.fn(),
  };
});

import {
  getHourlyPeakHeatmap,
  getMonthlyDeliveryOrders,
  getSalesReport,
  getTopProducts,
} from '../../src/controllers/analyticsController';
import { prisma } from '../../src/lib/prisma';
import { resolveBranchStoreId } from '../../src/middleware/auth';
import { AppError } from '../../src/middleware/errorHandler';

describe('getSalesReport', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
  });

  it('aggregates totalRevenue and byMode from paid orders with pagination metadata', async () => {
    vi.mocked(prisma.order.count).mockResolvedValue(3 as never);
    vi.mocked(prisma.order.aggregate).mockResolvedValue({
      _sum: { total: 1800, discount: 120, loyaltyDiscount: 40 },
    } as never);
    vi.mocked(prisma.order.groupBy).mockResolvedValue([
      { orderMode: 'DELIVERY', _sum: { total: 1500 } },
      { orderMode: 'TAKEAWAY', _sum: { total: 300 } },
    ] as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { id: 'o1', orderNumber: '1001', total: 1000, orderMode: 'DELIVERY' },
      { id: 'o2', orderNumber: '1002', total: 500, orderMode: 'DELIVERY' },
      { id: 'o3', orderNumber: '1003', total: 300, orderMode: 'TAKEAWAY' },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getSalesReport(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        orders: expect.any(Array),
        totalRevenue: 1800,
        totalDiscount: 120,
        totalLoyaltyDiscount: 40,
        byMode: { DELIVERY: 1500, TAKEAWAY: 300 },
        count: 3,
        page: 1,
        pageSize: 50,
        total: 3,
      },
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, skip: 0 }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('filters by storeId and date range', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {
        storeId: 'store-a',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
      },
    });
    const res = createMockRes();

    await getSalesReport(req, res, next);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentStatus: 'PAID',
          status: { not: 'CANCELLED' },
          storeId: 'store-a',
          createdAt: {
            gte: new Date('2026-07-01T00:00:00.000Z'),
            lte: new Date('2026-07-15T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('scopes branch managers to their linked store when storeId is omitted', async () => {
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-nugegoda');

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-nugegoda' },
      query: {},
    });
    const res = createMockRes();

    await getSalesReport(req, res, next);

    expect(prisma.order.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-nugegoda' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects pageSize above 200', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { pageSize: '201' },
    });
    const res = createMockRes();

    await getSalesReport(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects date ranges wider than 92 days', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-05-01T00:00:00.000Z',
      },
    });
    const res = createMockRes();

    await getSalesReport(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].statusCode).toBe(400);
  });

  it('returns zeroed totals when there are no paid orders', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getSalesReport(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        orders: [],
        totalRevenue: 0,
        totalDiscount: 0,
        totalLoyaltyDiscount: 0,
        byMode: {},
        count: 0,
        page: 1,
        pageSize: 50,
        total: 0,
      },
    });
  });

  it('forwards validation errors for a malformed date', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { from: 'not-a-date' },
    });
    const res = createMockRes();

    await getSalesReport(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.order.findMany).mockRejectedValue(new Error('Sales query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getSalesReport(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('getTopProducts', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
  });

  function aggregateRows() {
    return [
      {
        product_id: 'p1',
        product_name: 'Milk Tea',
        order_mode: 'DELIVERY',
        qty: 5,
        revenue: 2500,
      },
      {
        product_id: 'p1',
        product_name: 'Milk Tea',
        order_mode: 'TAKEAWAY',
        qty: 3,
        revenue: 1500,
      },
      {
        product_id: 'p2',
        product_name: 'Bubble Tea',
        order_mode: 'TAKEAWAY',
        qty: 10,
        revenue: 8000,
      },
    ];
  }

  function mockTopProductCatalogue() {
    vi.mocked(prisma.$queryRaw).mockResolvedValue(aggregateRows() as never);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'p1', slug: 'milk-tea', category: { name: 'Tea' } },
      { id: 'p2', slug: null, category: { name: 'Tea' } },
    ] as never);
  }

  it('aggregates quantity/revenue per product and splits pickup vs delivery', async () => {
    mockTopProductCatalogue();

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getTopProducts(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          productId: 'p2',
          productName: 'Bubble Tea',
          totalQuantity: 10,
          pickupQuantity: 10,
          deliveryQuantity: 0,
          totalRevenue: 8000,
          sku: 'P2',
        }),
        expect.objectContaining({
          productId: 'p1',
          productName: 'Milk Tea',
          sku: 'milk-tea',
          totalQuantity: 8,
          pickupQuantity: 3,
          deliveryQuantity: 5,
          totalRevenue: 4000,
        }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('sorts by least quantity when sortBy=least', async () => {
    mockTopProductCatalogue();

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { sortBy: 'least' },
    });
    const res = createMockRes();

    await getTopProducts(req, res, next);

    const data = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data as Array<{ productId: string }>;
    expect(data.map((d) => d.productId)).toEqual(['p1', 'p2']);
  });

  it('applies orderMode and storeId filters via aggregated SQL', async () => {
    mockTopProductCatalogue();
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { orderMode: 'DELIVERY', storeId: 'store-a', limit: '5' },
    });
    const res = createMockRes();

    await getTopProducts(req, res, next);

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects date ranges wider than 92 days', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { from: '2026-01-01', to: '2026-05-01' },
    });
    const res = createMockRes();

    await getTopProducts(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].statusCode).toBe(400);
  });

  it('returns an empty array when there are no matching order items', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getTopProducts(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
  });

  it('forwards validation errors for an out-of-range limit', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { limit: '500' },
    });
    const res = createMockRes();

    await getTopProducts(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('Top products query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getTopProducts(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('getHourlyPeakHeatmap', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
  });

  it('buckets paid orders into day/hour heatmap cells', async () => {
    vi.mocked(prisma.store.findMany).mockResolvedValue([{ id: 'store-a', name: 'Store A' }] as never);
    const colombo9amUtc = new Date('2026-07-20T03:30:00.000Z');
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { createdAt: colombo9amUtc, total: 500 },
      { createdAt: colombo9amUtc, total: 700 },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getHourlyPeakHeatmap(req, res, next);

    const data = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data as {
      hourlyHeatmap: Array<{ day: number; hour: number; orders: number; revenue: number }>;
    };
    const cell = data.hourlyHeatmap.find((c) => c.day === 1 && c.hour === 9);
    expect(cell).toEqual({ day: 1, hour: 9, orders: 2, revenue: 1200 });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns a zeroed heatmap when there are no active stores for the tier', async () => {
    vi.mocked(prisma.store.findMany).mockResolvedValue([] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month', tier: 'top' },
    });
    const res = createMockRes();

    await getHourlyPeakHeatmap(req, res, next);

    const data = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data as {
      hourlyHeatmap: Array<{ orders: number; revenue: number }>;
    };
    expect(data.hourlyHeatmap).toHaveLength(7 * 24);
    expect(data.hourlyHeatmap.every((c) => c.orders === 0 && c.revenue === 0)).toBe(true);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.store.findMany).mockRejectedValue(new Error('Store query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getHourlyPeakHeatmap(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('getMonthlyDeliveryOrders', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
  });

  it('buckets delivery orders by month for the requested year', async () => {
    vi.mocked(prisma.store.findMany).mockResolvedValue([{ id: 'store-a' }] as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { createdAt: new Date('2026-02-10T10:00:00'), total: 1000 },
      { createdAt: new Date('2026-02-20T10:00:00'), total: 500 },
      { createdAt: new Date('2026-05-01T10:00:00'), total: 250 },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { year: '2026' },
    });
    const res = createMockRes();

    await getMonthlyDeliveryOrders(req, res, next);

    const data = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data as {
      year: number;
      monthlyDeliveryOrders: Array<{ shortMonth: string; orders: number; revenue: number }>;
    };
    expect(data.year).toBe(2026);
    expect(data.monthlyDeliveryOrders).toHaveLength(12);
    expect(data.monthlyDeliveryOrders.find((m) => m.shortMonth === 'Feb')).toEqual(
      expect.objectContaining({ orders: 2, revenue: 1500 }),
    );
    expect(data.monthlyDeliveryOrders.find((m) => m.shortMonth === 'May')).toEqual(
      expect.objectContaining({ orders: 1, revenue: 250 }),
    );
    expect(data.monthlyDeliveryOrders.find((m) => m.shortMonth === 'Jan')).toEqual(
      expect.objectContaining({ orders: 0, revenue: 0 }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns zeroed months when there are no stores for the tier', async () => {
    vi.mocked(prisma.store.findMany).mockResolvedValue([] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { year: '2026', tier: 'top' },
    });
    const res = createMockRes();

    await getMonthlyDeliveryOrders(req, res, next);

    const data = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data as {
      monthlyDeliveryOrders: Array<{ orders: number; revenue: number }>;
    };
    expect(data.monthlyDeliveryOrders).toHaveLength(12);
    expect(data.monthlyDeliveryOrders.every((m) => m.orders === 0 && m.revenue === 0)).toBe(true);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('forwards validation errors for an out-of-range year', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { year: '1999' },
    });
    const res = createMockRes();

    await getMonthlyDeliveryOrders(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.store.findMany).mockResolvedValue([{ id: 'store-a' }] as never);
    vi.mocked(prisma.order.findMany).mockRejectedValue(new Error('Monthly delivery query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { year: '2026' },
    });
    const res = createMockRes();

    await getMonthlyDeliveryOrders(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
