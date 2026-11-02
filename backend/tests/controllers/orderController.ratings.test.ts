import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findFirst: vi.fn(),
    },
    platformRating: {
      create: vi.fn(),
    },
    riderRating: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/deliveryJobHelpers', () => ({
  incrementJobRiderRating: vi.fn().mockResolvedValue(undefined),
}));

import { submitPlatformRating, submitRiderRating } from '../../src/controllers/orderController';
import { incrementJobRiderRating } from '../../src/lib/deliveryJobHelpers';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';

const createdAt = new Date('2026-07-22T12:00:00.000Z');

describe('submitPlatformRating', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.platformRating.create).mockResolvedValue({
      stars: 5,
      comment: null,
      createdAt,
    } as never);
  });

  it('creates an anonymous rating for a guest order via the public tracking link', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: 'order-1',
      orderNumber: 'BC260722-1001',
      trackToken: 'track-secret-1',
      userId: null,
      orderMode: 'TAKEAWAY',
      status: 'DELIVERED',
      platformRating: null,
    } as never);

    const req = createMockReq({
      params: { id: 'track-secret-1' },
      body: { stars: 5 },
      user: undefined,
    });
    const res = createMockRes();

    await submitPlatformRating(req, res, next);

    expect(prisma.platformRating.create).toHaveBeenCalledWith({
      data: { orderId: 'order-1', userId: null, stars: 5, comment: null },
      select: { stars: true, comment: true, createdAt: true },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { stars: 5, comment: null, createdAt: createdAt.toISOString() },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('attributes the rating to the logged-in customer rating their own order', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: 'order-1',
      orderNumber: 'BC260722-1001',
      trackToken: 'track-secret-1',
      userId: 'user-1',
      orderMode: 'TAKEAWAY',
      status: 'READY',
      platformRating: null,
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 4, comment: '  Loved it!  ' },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await submitPlatformRating(req, res, next);

    expect(prisma.platformRating.create).toHaveBeenCalledWith({
      data: { orderId: 'order-1', userId: 'user-1', stars: 4, comment: 'Loved it!' },
      select: { stars: true, comment: true, createdAt: true },
    });
  });

  it('attributes the rating to the order owner when an admin submits it', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: 'order-1',
      orderNumber: 'BC260722-1001',
      trackToken: 'track-secret-1',
      userId: 'user-1',
      orderMode: 'DELIVERY',
      status: 'DELIVERED',
      platformRating: null,
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 3 },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await submitPlatformRating(req, res, next);

    expect(prisma.platformRating.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) }),
    );
  });

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

    const req = createMockReq({
      params: { id: 'missing-order' },
      body: { stars: 5 },
      user: undefined,
    });
    const res = createMockRes();

    await submitPlatformRating(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('blocks a different logged-in customer from rating someone else\'s order by UUID', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: 'order-1',
      orderNumber: 'BC260722-1001',
      trackToken: 'track-secret-1',
      userId: 'user-1',
      orderMode: 'DELIVERY',
      status: 'DELIVERED',
      platformRating: null,
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 5 },
      user: { sub: 'someone-else', type: 'user' },
    });
    const res = createMockRes();

    await submitPlatformRating(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect(prisma.platformRating.create).not.toHaveBeenCalled();
  });

  it('rejects rating a delivery order before it is DELIVERED', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: 'order-1',
      orderNumber: 'BC260722-1001',
      trackToken: 'track-secret-1',
      userId: null,
      orderMode: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
      platformRating: null,
    } as never);

    const req = createMockReq({
      params: { id: 'track-secret-1' },
      body: { stars: 5 },
      user: undefined,
    });
    const res = createMockRes();

    await submitPlatformRating(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Rating is only available after your order is complete',
    );
  });

  it('allows rating a takeaway order once it reaches READY (before pickup)', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: 'order-1',
      orderNumber: 'BC260722-1001',
      trackToken: 'track-secret-1',
      userId: null,
      orderMode: 'TAKEAWAY',
      status: 'READY',
      platformRating: null,
    } as never);

    const req = createMockReq({
      params: { id: 'track-secret-1' },
      body: { stars: 5 },
      user: undefined,
    });
    const res = createMockRes();

    await submitPlatformRating(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.platformRating.create).toHaveBeenCalled();
  });

  it('rejects rating an order twice', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: 'order-1',
      orderNumber: 'BC260722-1001',
      trackToken: 'track-secret-1',
      userId: null,
      orderMode: 'TAKEAWAY',
      status: 'DELIVERED',
      platformRating: { id: 'rating-1' },
    } as never);

    const req = createMockReq({
      params: { id: 'track-secret-1' },
      body: { stars: 5 },
      user: undefined,
    });
    const res = createMockRes();

    await submitPlatformRating(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(409);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('You have already rated this order');
  });

  it('forwards validation errors for out-of-range stars', async () => {
    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 6 },
      user: undefined,
    });
    const res = createMockRes();

    await submitPlatformRating(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.order.findFirst).mockRejectedValue(new Error('DB unavailable'));

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 5 },
      user: undefined,
    });
    const res = createMockRes();

    await submitPlatformRating(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('submitRiderRating', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.riderRating.create).mockResolvedValue({
      stars: 5,
      comment: null,
      createdAt,
    } as never);
  });

  const deliveredWithDriver = {
    id: 'order-1',
    orderNumber: 'BC260722-1001',
    trackToken: 'track-secret-1',
    userId: 'user-1',
    orderMode: 'DELIVERY',
    status: 'DELIVERED',
    riderRating: null,
    deliveryJobOrders: [{ job: { driverId: 'driver-1' } }],
  };

  it('creates a rider rating and increments the aggregate job rating', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(deliveredWithDriver as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 5, comment: 'Fast delivery!' },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await submitRiderRating(req, res, next);

    expect(prisma.riderRating.create).toHaveBeenCalledWith({
      data: { orderId: 'order-1', driverId: 'driver-1', userId: 'user-1', stars: 5, comment: 'Fast delivery!' },
      select: { stars: true, comment: true, createdAt: true },
    });
    expect(incrementJobRiderRating).toHaveBeenCalledWith('order-1', 5);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { stars: 5, comment: null, createdAt: createdAt.toISOString() },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

    const req = createMockReq({
      params: { id: 'missing-order' },
      body: { stars: 5 },
      user: undefined,
    });
    const res = createMockRes();

    await submitRiderRating(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('blocks a different logged-in customer from rating someone else\'s delivery by UUID', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(deliveredWithDriver as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 5 },
      user: { sub: 'someone-else', type: 'user' },
    });
    const res = createMockRes();

    await submitRiderRating(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect(prisma.riderRating.create).not.toHaveBeenCalled();
  });

  it('rejects rider ratings for takeaway orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...deliveredWithDriver,
      orderMode: 'TAKEAWAY',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 5 },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await submitRiderRating(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Rider rating is only available for delivery orders',
    );
  });

  it('rejects rider ratings before the delivery is complete', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...deliveredWithDriver,
      status: 'OUT_FOR_DELIVERY',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 5 },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await submitRiderRating(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Rider rating is only available after delivery is complete',
    );
  });

  it('rejects rating the same delivery twice', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...deliveredWithDriver,
      riderRating: { id: 'rating-1' },
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 5 },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await submitRiderRating(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(409);
  });

  it('rejects when no rider is linked to the completed delivery', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...deliveredWithDriver,
      deliveryJobOrders: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 5 },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await submitRiderRating(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('No rider is linked to this delivery');
    expect(prisma.riderRating.create).not.toHaveBeenCalled();
  });

  it('forwards validation errors for out-of-range stars', async () => {
    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 0 },
      user: undefined,
    });
    const res = createMockRes();

    await submitRiderRating(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('swallows job-rating aggregate failures without failing the request', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(deliveredWithDriver as never);
    vi.mocked(incrementJobRiderRating).mockRejectedValue(new Error('aggregate update failed'));

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 5 },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await submitRiderRating(req, res, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.order.findFirst).mockRejectedValue(new Error('DB unavailable'));

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { stars: 5 },
      user: undefined,
    });
    const res = createMockRes();

    await submitRiderRating(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
