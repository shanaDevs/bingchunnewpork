import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { getMyOrders } from '../../src/controllers/orderController';
import { prisma } from '../../src/lib/prisma';

describe('getMyOrders', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ phone: '0771234567' } as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([]);
    vi.mocked(prisma.order.count).mockResolvedValue(0);
  });

  it('looks up orders by userId or unclaimed guest-phone variants only', async () => {
    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      query: {},
    });
    const res = createMockRes();

    await getMyOrders(req, res, next);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { phone: true },
    });
    const findArgs = vi.mocked(prisma.order.findMany).mock.calls[0]?.[0];
    expect(findArgs).toBeDefined();
    expect(findArgs!.where!.OR).toEqual([
      { userId: 'user-1' },
      { userId: null, guestPhone: { in: expect.arrayContaining(['0771234567']) } },
    ]);
    expect(findArgs!.orderBy).toEqual({ createdAt: 'desc' });
    expect(findArgs!.skip).toBe(0);
    expect(findArgs!.take).toBe(10);
    expect(next).not.toHaveBeenCalled();
  });

  it('falls back to userId-only lookup when the account has no phone on file', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ phone: null } as never);

    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      query: {},
    });
    const res = createMockRes();

    await getMyOrders(req, res, next);

    const findArgs = vi.mocked(prisma.order.findMany).mock.calls[0]?.[0];
    expect(findArgs).toBeDefined();
    expect(findArgs!.where).toEqual({ userId: 'user-1' });
  });

  it('filters to ongoing orders (excludes DELIVERED and CANCELLED)', async () => {
    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      query: { filter: 'ongoing' },
    });
    const res = createMockRes();

    await getMyOrders(req, res, next);

    const findArgs = vi.mocked(prisma.order.findMany).mock.calls[0]?.[0];
    expect(findArgs).toBeDefined();
    expect(findArgs!.where!.status).toEqual({ notIn: ['DELIVERED', 'CANCELLED'] });
  });

  it('filters to completed orders (DELIVERED or CANCELLED)', async () => {
    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      query: { filter: 'completed' },
    });
    const res = createMockRes();

    await getMyOrders(req, res, next);

    const findArgs = vi.mocked(prisma.order.findMany).mock.calls[0]?.[0];
    expect(findArgs).toBeDefined();
    expect(findArgs!.where!.status).toEqual({ in: ['DELIVERED', 'CANCELLED'] });
  });

  it('sorts oldest first when requested', async () => {
    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      query: { sort: 'oldest' },
    });
    const res = createMockRes();

    await getMyOrders(req, res, next);

    const findArgs = vi.mocked(prisma.order.findMany).mock.calls[0]?.[0];
    expect(findArgs).toBeDefined();
    expect(findArgs!.orderBy).toEqual({ createdAt: 'asc' });
  });

  it('clamps the page size to a maximum of 50', async () => {
    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      query: { limit: '500' },
    });
    const res = createMockRes();

    await getMyOrders(req, res, next);

    const findArgs = vi.mocked(prisma.order.findMany).mock.calls[0]?.[0];
    expect(findArgs).toBeDefined();
    expect(findArgs!.take).toBe(50);
  });

  it('defaults invalid page/limit query values to 1 and 10', async () => {
    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      query: { page: 'abc', limit: 'xyz' },
    });
    const res = createMockRes();

    await getMyOrders(req, res, next);

    const findArgs = vi.mocked(prisma.order.findMany).mock.calls[0]?.[0];
    expect(findArgs).toBeDefined();
    expect(findArgs!.skip).toBe(0);
    expect(findArgs!.take).toBe(10);
  });

  it('computes skip correctly for later pages', async () => {
    vi.mocked(prisma.order.count).mockResolvedValue(45);

    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      query: { page: '3', limit: '10' },
    });
    const res = createMockRes();

    await getMyOrders(req, res, next);

    expect(vi.mocked(prisma.order.findMany).mock.calls[0]?.[0]?.skip).toBe(20);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { total: 45, page: 3, limit: 10, pages: 5 } }),
    );
  });

  it('strips staff attribution from customer order history', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'order-1',
        processedByAdminId: 'cashier-b',
        processedByName: 'Cashier B',
        processedAt: new Date(),
        items: [],
        store: { id: 'store-1', name: 'Nugegoda' },
      },
    ] as never);
    vi.mocked(prisma.order.count).mockResolvedValue(1);

    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      query: {},
    });
    const res = createMockRes();

    await getMyOrders(req, res, next);

    const payload = vi.mocked(res.json).mock.calls[0][0] as { data: Array<Record<string, unknown>> };
    expect(payload.data[0]).not.toHaveProperty('processedByName');
    expect(payload.data[0]).not.toHaveProperty('processedByAdminId');
    expect(payload.data[0].id).toBe('order-1');
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.order.findMany).mockRejectedValue(new Error('DB unavailable'));

    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      query: {},
    });
    const res = createMockRes();

    await getMyOrders(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
