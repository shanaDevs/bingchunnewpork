import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findFirst: vi.fn(),
    },
    deliveryJobOrder: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    deliveryEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    driverLocation: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    adminUser: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../src/lib/deliveryCodeLive', () => ({
  getLiveDeliveryCode: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    assertOrderStoreAccess: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../src/lib/appSchema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/appSchema')>();
  return {
    ...actual,
    getPickupOrderEditSettings: vi.fn().mockResolvedValue({
      allowAddItemsPaidOnline: true,
      allowEditCashUnpaid: true,
    }),
    getCancelWindowMinutes: vi.fn().mockResolvedValue(10),
  };
});

import { getOrder } from '../../src/controllers/orderController';
import { getPickupOrderEditSettings } from '../../src/lib/appSchema';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';

const baseOrder = {
  id: 'order-uuid-1',
  orderNumber: 'BC260722-1001',
  trackToken: 'track-secret-1',
  userId: 'user-1',
  storeId: 'store-1',
  orderMode: 'DELIVERY',
  status: 'PREPARING',
  paymentMethod: 'CASH_ON_DELIVERY',
  paymentStatus: 'PENDING',
  total: 1500,
  convenientFee: 0,
  createdAt: new Date('2026-07-22T10:00:00.000Z'),
  prepaidAmount: 0,
  items: [
    {
      id: 'item-1',
      productName: 'Milk Tea',
      quantity: 1,
      toppings: [],
      product: { imageUrl: null },
    },
  ],
  statusEvents: [],
  store: { id: 'store-1', name: 'Nugegoda', addressLine: '1 Main St', lat: 0, lng: 0 },
  address: null,
  user: { name: 'John Doe', phone: '0771234567' },
  platformRating: null,
  processedByAdminId: 'cashier-b',
  processedByName: 'Cashier B',
  processedAt: new Date('2026-07-22T10:05:00.000Z'),
};

describe('getOrder', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPickupOrderEditSettings).mockResolvedValue({
      allowAddItemsPaidOnline: true,
      allowEditCashUnpaid: true,
    });
  });

  it('returns order details for the public track-token link with no auth', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(baseOrder as never);

    const req = createMockReq({ params: { id: 'track-secret-1' }, user: undefined });
    const res = createMockRes();

    await getOrder(req, res, next);

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { id: 'track-secret-1' },
            { orderNumber: 'track-secret-1' },
            { trackToken: 'track-secret-1' },
          ],
        },
      }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ id: 'order-uuid-1', platformRating: null }),
      }),
    );
    const payload = vi.mocked(res.json).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(payload.data).not.toHaveProperty('processedByName');
    expect(payload.data).not.toHaveProperty('processedByAdminId');
  });

  it('rejects public lookup by order number alone', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(baseOrder as never);

    const req = createMockReq({ params: { id: 'BC260722-1001' }, user: undefined });
    const res = createMockRes();

    await getOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
  });

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

    const req = createMockReq({ params: { id: 'missing-order' }, user: undefined });
    const res = createMockRes();

    await getOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('allows the owning customer to fetch their own order by UUID', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(baseOrder as never);

    const req = createMockReq({
      params: { id: 'order-uuid-1' },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await getOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
    const payload = vi.mocked(res.json).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(payload.data).not.toHaveProperty('processedByName');
    expect(payload.data).not.toHaveProperty('processedByAdminId');
  });

  it('blocks a different logged-in customer from fetching someone else\'s order by UUID', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(baseOrder as never);

    const req = createMockReq({
      params: { id: 'order-uuid-1' },
      user: { sub: 'someone-else', type: 'user' },
    });
    const res = createMockRes();

    await getOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Valid track token or account sign-in required',
    );
  });

  it('allows any admin to fetch an order by UUID regardless of ownership, decorated with edit flags', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(baseOrder as never);

    const req = createMockReq({
      params: { id: 'order-uuid-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await getOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(getPickupOrderEditSettings).toHaveBeenCalled();
    // baseOrder is a DELIVERY / CASH_ON_DELIVERY order, which is never admin-editable pickup-style.
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          canEdit: false,
          canAddItems: false,
          editMode: null,
          balanceDue: 0,
          processedByName: 'Cashier B',
        }),
      }),
    );
  });

  it('does not allow public order-number links even when logged in as another user', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(baseOrder as never);

    const req = createMockReq({
      params: { id: 'BC260722-1001' },
      user: { sub: 'someone-else', type: 'user' },
    });
    const res = createMockRes();

    await getOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
  });

  it('blocks random users from guest orders without the track token', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({ ...baseOrder, userId: null } as never);

    const req = createMockReq({
      params: { id: 'order-uuid-1' },
      user: { sub: 'random-user', type: 'user' },
    });
    const res = createMockRes();

    await getOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
  });

  it('serialises platform rating timestamps to ISO strings when present', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...baseOrder,
      platformRating: { stars: 5, comment: 'Great!', createdAt: new Date('2026-07-20T10:00:00.000Z') },
    } as never);

    const req = createMockReq({ params: { id: 'track-secret-1' }, user: undefined });
    const res = createMockRes();

    await getOrder(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          platformRating: { stars: 5, comment: 'Great!', createdAt: '2026-07-20T10:00:00.000Z' },
        }),
      }),
    );
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.order.findFirst).mockRejectedValue(new Error('DB unavailable'));

    const req = createMockReq({ params: { id: 'order-uuid-1' }, user: undefined });
    const res = createMockRes();

    await getOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
