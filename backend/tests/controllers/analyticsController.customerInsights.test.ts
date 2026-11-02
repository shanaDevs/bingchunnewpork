import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';
import { createAnalyticsPrismaMock, resetAnalyticsPrismaDefaults } from '../helpers/analyticsPrisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: createAnalyticsPrismaMock(),
}));

import { getCustomerLoyalty, getTopCustomers } from '../../src/controllers/analyticsController';
import { prisma } from '../../src/lib/prisma';

describe('getTopCustomers', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
  });

  it('builds top customers by spend from paid orders including guests', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        userId: 'user-1',
        guestPhone: null,
        guestName: null,
        guestEmail: null,
        total: 5000,
        storeId: 'store-a',
        user: { id: 'user-1', name: 'Alice', phone: '0771111111', email: 'alice@example.com' },
        store: { name: 'Store A' },
        items: [{ productName: 'Milk Tea', quantity: 2 }],
      },
      {
        userId: null,
        guestPhone: '0772222222',
        guestName: 'Bob Guest',
        guestEmail: null,
        total: 8000,
        storeId: 'store-a',
        user: null,
        store: { name: 'Store A' },
        items: [{ productName: 'Bubble Tea', quantity: 3 }],
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getTopCustomers(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        topCustomers: [
          expect.objectContaining({ rank: 1, name: 'Bob Guest', orders: 1, totalSpend: 8000 }),
          expect.objectContaining({ rank: 2, name: 'Alice', orders: 1, totalSpend: 5000 }),
        ],
      }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('sorts by orders when sortBy=orders is used', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        userId: 'user-1',
        guestPhone: null,
        guestName: null,
        guestEmail: null,
        total: 1000,
        storeId: 'store-a',
        user: { id: 'user-1', name: 'Alice', phone: '0771111111', email: null },
        store: { name: 'Store A' },
        items: [],
      },
      {
        userId: 'user-2',
        guestPhone: null,
        guestName: null,
        guestEmail: null,
        total: 100,
        storeId: 'store-a',
        user: { id: 'user-2', name: 'Cara', phone: '0773333333', email: null },
        store: { name: 'Store A' },
        items: [],
      },
      {
        userId: 'user-2',
        guestPhone: null,
        guestName: null,
        guestEmail: null,
        total: 100,
        storeId: 'store-a',
        user: { id: 'user-2', name: 'Cara', phone: '0773333333', email: null },
        store: { name: 'Store A' },
        items: [],
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month', sortBy: 'orders' },
    });
    const res = createMockRes();

    await getTopCustomers(req, res, next);

    const data = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].data as {
      topCustomers: Array<{ name: string; orders: number }>;
    };
    expect(data.topCustomers[0]).toEqual(expect.objectContaining({ name: 'Cara', orders: 2 }));
  });

  it('returns empty results when the requested storeId does not match an active store', async () => {
    vi.mocked(prisma.store.findFirst).mockResolvedValue(null);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month', storeId: 'unknown-store' },
    });
    const res = createMockRes();

    await getTopCustomers(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { topCustomers: [], topCustomersByOrders: [] },
    });
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('forwards validation errors when period=custom is missing from/to', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'custom' },
    });
    const res = createMockRes();

    await getTopCustomers(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.order.findMany).mockRejectedValue(new Error('Top customers query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getTopCustomers(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('getCustomerLoyalty', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
  });

  it('classifies customers as NEW or LOYAL based on the loyalty threshold', async () => {
    vi.mocked(prisma.order.groupBy).mockResolvedValue([
      {
        userId: 'user-1',
        _count: { _all: 2 },
        _sum: { total: 3000 },
        _min: { createdAt: new Date('2026-01-05') },
        _max: { createdAt: new Date('2026-02-05') },
      },
      {
        userId: 'user-2',
        _count: { _all: 1 },
        _sum: { total: 500 },
        _min: { createdAt: new Date('2026-01-10') },
        _max: { createdAt: new Date('2026-01-10') },
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
        phone: '0771111111',
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'user-2',
        name: 'Bob',
        phone: '0772222222',
        createdAt: new Date('2026-01-01'),
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getCustomerLoyalty(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        loyaltyThreshold: 2,
        customers: [
          expect.objectContaining({ customerId: 'user-1', customerType: 'LOYAL', totalOrders: 2, totalValue: 3000 }),
          expect.objectContaining({ customerId: 'user-2', customerType: 'NEW', totalOrders: 1, totalValue: 500 }),
        ],
        summary: { total: 2, newCount: 1, loyalCount: 1 },
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('filters to only LOYAL customers when customerType=LOYAL', async () => {
    vi.mocked(prisma.order.groupBy).mockResolvedValue([
      {
        userId: 'user-1',
        _count: { _all: 2 },
        _sum: { total: 3000 },
        _min: { createdAt: new Date('2026-01-05') },
        _max: { createdAt: new Date('2026-02-05') },
      },
      {
        userId: 'user-2',
        _count: { _all: 1 },
        _sum: { total: 500 },
        _min: { createdAt: new Date('2026-01-10') },
        _max: { createdAt: new Date('2026-01-10') },
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
        phone: '0771111111',
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'user-2',
        name: 'Bob',
        phone: '0772222222',
        createdAt: new Date('2026-01-01'),
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { customerType: 'LOYAL' },
    });
    const res = createMockRes();

    await getCustomerLoyalty(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        customers: [expect.objectContaining({ customerId: 'user-1' })],
        summary: { total: 1, newCount: 0, loyalCount: 1 },
      }),
    });
  });

  it('excludes customers with no orders in the range', async () => {
    vi.mocked(prisma.order.groupBy).mockResolvedValue([] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getCustomerLoyalty(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { loyaltyThreshold: 2, customers: [], summary: { total: 0, newCount: 0, loyalCount: 0 } },
    });
  });

  it('forwards validation errors for an out-of-range loyalty threshold', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { loyaltyThreshold: '1000' },
    });
    const res = createMockRes();

    await getCustomerLoyalty(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.order.groupBy).mockRejectedValue(new Error('Customer loyalty query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getCustomerLoyalty(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
