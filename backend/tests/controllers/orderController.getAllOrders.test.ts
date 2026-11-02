import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    isBranchScopedRole: vi.fn(),
    requireBranchStoreId: vi.fn(),
  };
});

vi.mock('../../src/lib/appSchema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/appSchema')>();
  return {
    ...actual,
    getCancelWindowMinutes: vi.fn().mockResolvedValue(10),
  };
});

vi.mock('../../src/lib/orderStatusRefundConfig', () => ({
  getRefundPercentageForStatus: vi.fn().mockResolvedValue(100),
  getOrderStatusRefundPercentageMap: vi.fn().mockResolvedValue(new Map([
    ['RECEIVED', 100],
    ['PREPARING', 80],
    ['READY', 60],
    ['OUT_FOR_DELIVERY', 40],
  ])),
}));

vi.mock('../../src/lib/orderSchema', () => ({
  getCancelWindowStartsAtMap: vi.fn().mockResolvedValue(new Map()),
}));

import { getAllOrders } from '../../src/controllers/orderController';
import { prisma } from '../../src/lib/prisma';
import { isBranchScopedRole, requireBranchStoreId } from '../../src/middleware/auth';

describe('getAllOrders', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBranchScopedRole).mockReturnValue(false);
    vi.mocked(prisma.order.findMany).mockResolvedValue([]);
    vi.mocked(prisma.order.count).mockResolvedValue(0);
  });

  it('returns paginated orders for a branch admin scoped to their store', async () => {
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(requireBranchStoreId).mockResolvedValue('store-nugegoda');
    const orders = [
      {
        id: 'order-1',
        orderNumber: 'BC260722-1001',
        items: [],
        status: 'PREPARING',
        createdAt: new Date('2026-07-22T10:00:00.000Z'),
        total: 1500,
        convenientFee: 0,
        paymentMethod: 'CASH_AT_COUNTER',
        paymentStatus: 'PENDING',
      },
    ];
    vi.mocked(prisma.order.findMany).mockResolvedValue(orders as never);
    vi.mocked(prisma.order.count).mockResolvedValue(1);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-nugegoda' },
      query: { page: '1', limit: '20' },
    });
    const res = createMockRes();

    await getAllOrders(req, res, next);

    expect(requireBranchStoreId).toHaveBeenCalledWith(req);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-nugegoda' }),
        skip: 0,
        take: 20,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: [expect.objectContaining({ id: 'order-1', orderNumber: 'BC260722-1001' })],
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('applies search, status, order mode, and payment filters', async () => {
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(requireBranchStoreId).mockResolvedValue('store-1');

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: {
        search: 'BC260722',
        status: 'PREPARING',
        orderMode: 'TAKEAWAY',
        paymentStatus: 'PENDING',
        sortDir: 'asc',
      },
    });
    const res = createMockRes();

    await getAllOrders(req, res, next);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-1',
          status: 'PREPARING',
          orderMode: 'TAKEAWAY',
          paymentStatus: 'PENDING',
          OR: [{ orderNumber: { contains: 'BC260722' } }, { id: 'BC260722' }],
        }),
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  it('applies pickup fulfillment queue payment filter', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { orderMode: 'TAKEAWAY', fulfillmentQueue: 'pickup' },
    });
    const res = createMockRes();

    await getAllOrders(req, res, next);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderMode: 'TAKEAWAY',
          AND: [
            {
              OR: [{ paymentStatus: 'PAID' }, { paymentMethod: 'CASH_AT_COUNTER' }],
            },
          ],
        }),
      }),
    );
  });

  it('applies delivery fulfillment queue payment filter', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { orderMode: 'DELIVERY', fulfillmentQueue: 'delivery' },
    });
    const res = createMockRes();

    await getAllOrders(req, res, next);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderMode: 'DELIVERY',
          AND: [{ paymentStatus: 'PAID' }],
        }),
      }),
    );
  });

  it('supports excludeStatus and date range filters', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {
        excludeStatus: 'DELIVERED,CANCELLED',
        startDate: '2026-07-01',
        endDate: '2026-07-22',
        storeId: 'store-1',
      },
    });
    const res = createMockRes();

    await getAllOrders(req, res, next);

    const findArgs = vi.mocked(prisma.order.findMany).mock.calls[0][0];
    expect(findArgs.where).toMatchObject({
      storeId: 'store-1',
      status: { notIn: ['DELIVERED', 'CANCELLED'] },
    });
    expect(findArgs.where.createdAt.gte).toBeInstanceOf(Date);
    expect(findArgs.where.createdAt.lte).toBeInstanceOf(Date);
  });

  it('paginates with skip based on page and limit', async () => {
    vi.mocked(prisma.order.count).mockResolvedValue(45);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { page: '3', limit: '10' },
    });
    const res = createMockRes();

    await getAllOrders(req, res, next);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: { total: 45, page: 3, limit: 10, pages: 5 },
      }),
    );
  });

  it('returns an empty page when no orders match', async () => {
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(requireBranchStoreId).mockResolvedValue('store-1');
    vi.mocked(prisma.order.findMany).mockResolvedValue([]);
    vi.mocked(prisma.order.count).mockResolvedValue(0);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'CASHIER' },
      query: { search: 'missing-order' },
    });
    const res = createMockRes();

    await getAllOrders(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [],
      meta: { total: 0, page: 1, limit: 20, pages: 0 },
    });
  });

  it('does not let branch admins query another store via storeId param', async () => {
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(requireBranchStoreId).mockResolvedValue('store-a');

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: { storeId: 'store-b' },
    });
    const res = createMockRes();

    await getAllOrders(req, res, next);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-a' }),
      }),
    );
    expect(prisma.order.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-b' }),
      }),
    );
  });

  it('applies processedById filter', async () => {
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(requireBranchStoreId).mockResolvedValue('store-1');

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      query: { processedById: 'cashier-b' },
    });
    const res = createMockRes();

    await getAllOrders(req, res, next);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-1',
          processedByAdminId: 'cashier-b',
        }),
      }),
    );
  });

  it('forwards prisma failures', async () => {
    vi.mocked(prisma.order.findMany).mockRejectedValue(new Error('DB unavailable'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getAllOrders(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
