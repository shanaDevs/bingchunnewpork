import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';
import { createAnalyticsPrismaMock, resetAnalyticsPrismaDefaults } from '../helpers/analyticsPrisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: createAnalyticsPrismaMock(),
}));

import { getOrderCancellations, getOrderFulfillment } from '../../src/controllers/analyticsController';
import { prisma } from '../../src/lib/prisma';

describe('getOrderFulfillment', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
  });

  it('computes avg prep/dispatch minutes and delay percentage per branch', async () => {
    const createdAt = new Date('2026-07-20T10:00:00');
    const readyAt = new Date('2026-07-20T10:20:00'); // +20 min prep
    const dispatchedAt = new Date('2026-07-20T10:30:00'); // +10 min dispatch
    const deliveredAt = new Date('2026-07-20T11:10:00'); // 70 min fulfillment (delayed, threshold 45)

    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'o1',
        storeId: 'store-a',
        orderMode: 'DELIVERY',
        estimatedMinutes: null,
        createdAt,
        store: { name: 'Store A' },
        statusEvents: [
          { status: 'READY', createdAt: readyAt },
          { status: 'OUT_FOR_DELIVERY', createdAt: dispatchedAt },
          { status: 'DELIVERED', createdAt: deliveredAt },
        ],
      },
      {
        id: 'o2',
        storeId: 'store-a',
        orderMode: 'TAKEAWAY',
        estimatedMinutes: null,
        createdAt,
        store: { name: 'Store A' },
        statusEvents: [{ status: 'READY', createdAt: new Date('2026-07-20T10:15:00') }], // 15 min, not delayed
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getOrderFulfillment(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        branches: [
          expect.objectContaining({
            branchName: 'Store A',
            totalOrders: 2,
            avgPreparationMinutes: 17.5, // (20 + 15) / 2
            avgDispatchMinutes: 10, // only o1 has both ready & dispatch events
            delayedOrders: 1,
            delayPercentage: 50,
          }),
        ],
        delayThresholdMinutes: 45,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('filters to only delayed orders when delayedOnly=true', async () => {
    const createdAt = new Date('2026-07-20T10:00:00');
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'o1',
        storeId: 'store-a',
        orderMode: 'TAKEAWAY',
        estimatedMinutes: null,
        createdAt,
        store: { name: 'Store A' },
        statusEvents: [{ status: 'READY', createdAt: new Date('2026-07-20T10:10:00') }], // not delayed
      },
      {
        id: 'o2',
        storeId: 'store-a',
        orderMode: 'TAKEAWAY',
        estimatedMinutes: null,
        createdAt,
        store: { name: 'Store A' },
        statusEvents: [{ status: 'READY', createdAt: new Date('2026-07-20T11:00:00') }], // 60 min, delayed
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month', delayedOnly: 'true' },
    });
    const res = createMockRes();

    await getOrderFulfillment(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        branches: [expect.objectContaining({ totalOrders: 1, delayedOrders: 1, delayPercentage: 100 })],
      }),
    });
  });

  it('returns an empty branches array when there are no matching orders', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getOrderFulfillment(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { branches: [], delayThresholdMinutes: 45 },
    });
  });

  it('forwards validation errors for an unknown orderMode', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { orderMode: 'BICYCLE' },
    });
    const res = createMockRes();

    await getOrderFulfillment(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.order.findMany).mockRejectedValue(new Error('Fulfillment query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getOrderFulfillment(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('getOrderCancellations', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsPrismaDefaults(prisma);
  });

  it('maps cancelled/refunded orders with parsed cancelledBy and reason', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'o1',
        orderNumber: '1001',
        total: 1500,
        paymentMethod: 'CARD',
        paymentStatus: 'REFUNDED',
        status: 'CANCELLED',
        createdAt: new Date('2026-07-20T10:00:00'),
        store: { name: 'Store A' },
        user: { name: 'Alice' },
        guestName: null,
        statusEvents: [{ note: 'Cancelled by: Customer | too slow', createdAt: new Date('2026-07-20T10:05:00') }],
      },
      {
        id: 'o2',
        orderNumber: '1002',
        total: 800,
        paymentMethod: 'CASH_AT_COUNTER',
        paymentStatus: 'PAID',
        status: 'CANCELLED',
        createdAt: new Date('2026-07-20T11:00:00'),
        store: { name: 'Store A' },
        user: null,
        guestName: 'Guest Bob',
        statusEvents: [],
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getOrderCancellations(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        cancellations: [
          expect.objectContaining({
            orderId: 'o1',
            orderNumber: '1001',
            branchName: 'Store A',
            orderValue: 1500,
            refundStatus: 'Refunded',
            cancelledBy: 'Customer',
            reason: 'Cancelled by: Customer | too slow',
            customerName: 'Alice',
          }),
          expect.objectContaining({
            orderId: 'o2',
            orderNumber: '1002',
            refundStatus: 'Not Refunded',
            cancelledBy: 'System',
            reason: 'Order cancelled',
            customerName: 'Guest Bob',
          }),
        ],
        count: 2,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('scopes the query to storeId and limit filters', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month', storeId: 'store-a', limit: '10' },
    });
    const res = createMockRes();

    await getOrderCancellations(req, res, next);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-a' }),
        take: 10,
      }),
    );
  });

  it('returns an empty list when there are no cancellations', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getOrderCancellations(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { cancellations: [], count: 0 },
    });
  });

  it('rejects an invalid custom date range', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'custom', from: '2026-07-20', to: '2026-07-01' },
    });
    const res = createMockRes();

    await getOrderCancellations(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.order.findMany).mockRejectedValue(new Error('Cancellations query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { period: 'month' },
    });
    const res = createMockRes();

    await getOrderCancellations(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
