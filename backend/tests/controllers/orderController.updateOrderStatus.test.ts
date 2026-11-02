import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => {
  const order = {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const tx = {
    order,
    refund: { create: vi.fn().mockResolvedValue({}) },
    deliveryJob: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    deliveryJobOrder: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  return {
    prisma: {
      order,
      adminUser: { findUnique: vi.fn() },
      deliveryJob: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      deliveryJobOrder: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      promotionUsage: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    },
  };
});

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    assertOrderStoreAccess: vi.fn(),
  };
});

vi.mock('../../src/controllers/walletController', () => ({
  creditWalletForOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/customerNotifications', () => ({
  notifyCustomerOrderStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/deliveryJobHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/deliveryJobHelpers')>();
  return {
    ...actual,
    maybeAutoCompleteDeliveryJobsForOrder: vi.fn().mockResolvedValue(undefined),
    syncJobDeliveryEventForOrderStatus: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../src/lib/driverOrderAlerts', () => ({
  notifyDriverOrderCancelled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/refundCreate', () => ({
  createRefundForCancelledOrder: vi.fn().mockResolvedValue(undefined),
  isOnlinePaidOrder: vi.fn().mockReturnValue(false),
  mapAdminCancelReasonToRefundReason: vi.fn().mockReturnValue({
    cancellationReason: 'CUSTOMER_REQUEST',
    customReasonText: null,
  }),
}));

vi.mock('../../src/lib/stockEngine', () => ({
  restoreOrderItems: vi.fn().mockResolvedValue(undefined),
  deductOrderItems: vi.fn().mockResolvedValue(undefined),
  orderStockWasDeducted: vi.fn().mockResolvedValue(false),
  validateOrderStock: vi.fn().mockResolvedValue(undefined),
}));

import { updateOrderStatus } from '../../src/controllers/orderController';
import { notifyCustomerOrderStatus } from '../../src/lib/customerNotifications';
import { maybeAutoCompleteDeliveryJobsForOrder, syncJobDeliveryEventForOrderStatus } from '../../src/lib/deliveryJobHelpers';
import { prisma } from '../../src/lib/prisma';
import { creditWalletForOrder } from '../../src/controllers/walletController';
import { assertOrderStoreAccess } from '../../src/middleware/auth';
import { AppError } from '../../src/middleware/errorHandler';

const baseOrder = {
  id: 'order-1',
  orderNumber: 'BC260722-1001',
  storeId: 'store-1',
  status: 'PREPARING',
  orderMode: 'TAKEAWAY',
  paymentMethod: 'CASH_AT_COUNTER',
  paymentStatus: 'PENDING',
  total: 1500,
  convenientFee: 0,
  userId: 'user-1',
  createdAt: new Date('2026-07-22T10:00:00.000Z'),
  items: [],
  user: { name: 'Jane' },
  refund: null,
};

describe('updateOrderStatus', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertOrderStoreAccess).mockResolvedValue(undefined);
  });

  it('accepts an order with a valid forward transition', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(baseOrder as never);
    const updated = { ...baseOrder, status: 'READY' };
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'READY', note: 'Order is ready for pickup' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(assertOrderStoreAccess).toHaveBeenCalledWith(req, 'store-1');
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        status: 'READY',
        statusEvents: {
          create: { status: 'READY', note: 'Order is ready for pickup' },
        },
      },
    });
    expect(notifyCustomerOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1', status: 'READY' }),
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an order by cancelling it', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(baseOrder as never);
    const cancelled = { ...baseOrder, status: 'CANCELLED' };
    vi.mocked(prisma.order.update).mockResolvedValue(cancelled as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'CANCELLED', note: 'Out of stock' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledAtStatus: 'PREPARING',
          statusEvents: { create: { status: 'CANCELLED', note: 'Out of stock' } },
        }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: cancelled });
  });

  it('marks cash-on-delivery orders paid when delivered', async () => {
    const deliveryOrder = {
      ...baseOrder,
      orderMode: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
      paymentMethod: 'CASH_ON_DELIVERY',
    };
    vi.mocked(prisma.order.findUnique).mockResolvedValue(deliveryOrder as never);
    const delivered = {
      ...deliveryOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      prepaidAmount: 1500,
    };
    vi.mocked(prisma.order.update).mockResolvedValue(delivered as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'DELIVERED' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          prepaidAmount: 1500,
        }),
      }),
    );
    expect(creditWalletForOrder).toHaveBeenCalledWith('order-1', 'store-1', 1500, 'CASH_ON_DELIVERY');
    expect(maybeAutoCompleteDeliveryJobsForOrder).toHaveBeenCalledWith('order-1');
    expect(syncJobDeliveryEventForOrderStatus).toHaveBeenCalledWith('order-1', 'DELIVERED');
  });

  it('rejects invalid backward transitions', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...baseOrder,
      status: 'READY',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'PREPARING' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Cannot revert order to a previous status',
    );
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(400);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('blocks cross-branch access with 403', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(baseOrder as never);
    vi.mocked(assertOrderStoreAccess).mockRejectedValue(
      new AppError('You can only manage orders for your branch', 403),
    );

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'READY' },
      user: { sub: 'admin-2', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-2' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

    const req = createMockReq({
      params: { id: 'missing-order' },
      body: { status: 'READY' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Order not found');
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('forwards validation errors for invalid status values', async () => {
    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'INVALID' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('propagates prisma update failures', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(baseOrder as never);
    vi.mocked(prisma.order.update).mockRejectedValue(new Error('DB write failed'));

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'READY' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects setting the same status the order already has', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(baseOrder as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'PREPARING' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Order is already in this status');
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(400);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects any status change once the order is already DELIVERED', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...baseOrder,
      status: 'DELIVERED',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'CANCELLED' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Cannot change status of a completed order');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects any status change once the order is already CANCELLED', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...baseOrder,
      status: 'CANCELLED',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'READY' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Cannot change status of a completed order');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('marks CASH_AT_COUNTER takeaway orders paid when delivered', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(baseOrder as never);
    const delivered = {
      ...baseOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      prepaidAmount: 1500,
    };
    vi.mocked(prisma.order.update).mockResolvedValue(delivered as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'DELIVERED' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          prepaidAmount: 1500,
        }),
      }),
    );
    expect(creditWalletForOrder).toHaveBeenCalledWith('order-1', 'store-1', 1500, 'CASH_AT_COUNTER');
    // Takeaway orders never route through the delivery-job auto-complete path.
    expect(maybeAutoCompleteDeliveryJobsForOrder).not.toHaveBeenCalled();
  });

  it('allows an admin to skip ahead from PREPARING straight to DELIVERED on a delivery order', async () => {
    const deliveryOrder = {
      ...baseOrder,
      orderMode: 'DELIVERY',
      status: 'PREPARING',
      paymentMethod: 'CASH_ON_DELIVERY',
    };
    vi.mocked(prisma.order.findUnique).mockResolvedValue(deliveryOrder as never);
    const delivered = { ...deliveryOrder, status: 'DELIVERED', paymentStatus: 'PAID', prepaidAmount: 1500 };
    vi.mocked(prisma.order.update).mockResolvedValue(delivered as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'DELIVERED' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    // assertValidStatusTransition only blocks backward moves, so skipping READY/OUT_FOR_DELIVERY is allowed.
    expect(next).not.toHaveBeenCalled();
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERED' }) }),
    );
  });

  it('rejects OUT_FOR_DELIVERY for takeaway orders (not part of the pickup flow)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...baseOrder,
      orderMode: 'TAKEAWAY',
      status: 'READY',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'OUT_FOR_DELIVERY' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid status for this order type');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('auto-completes delivery jobs when a delivery order is cancelled', async () => {
    const deliveryOrder = {
      ...baseOrder,
      orderMode: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
    };
    vi.mocked(prisma.order.findUnique).mockResolvedValue(deliveryOrder as never);
    const cancelled = { ...deliveryOrder, status: 'CANCELLED' };
    vi.mocked(prisma.order.update).mockResolvedValue(cancelled as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'CANCELLED' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledAtStatus: 'OUT_FOR_DELIVERY',
        }),
      }),
    );
    expect(maybeAutoCompleteDeliveryJobsForOrder).toHaveBeenCalledWith('order-1');
    expect(syncJobDeliveryEventForOrderStatus).toHaveBeenCalledWith('order-1', 'CANCELLED');
    expect(next).not.toHaveBeenCalled();
  });

  it('swallows wallet crediting failures and still returns success', async () => {
    const deliveryOrder = {
      ...baseOrder,
      orderMode: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
      paymentMethod: 'CASH_ON_DELIVERY',
    };
    vi.mocked(prisma.order.findUnique).mockResolvedValue(deliveryOrder as never);
    const delivered = { ...deliveryOrder, status: 'DELIVERED', paymentStatus: 'PAID', prepaidAmount: 1500 };
    vi.mocked(prisma.order.update).mockResolvedValue(delivered as never);
    vi.mocked(creditWalletForOrder).mockRejectedValue(new Error('wallet ledger unavailable'));

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'DELIVERED' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);
    // Allow the fire-and-forget wallet promise's rejection handler to run.
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it(
    'does not fail the request when the customer notification fails (order is already persisted)',
    async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(baseOrder as never);
      const updated = { ...baseOrder, status: 'READY' };
      vi.mocked(prisma.order.update).mockResolvedValue(updated as never);
      vi.mocked(notifyCustomerOrderStatus).mockRejectedValue(new Error('notification service down'));

      const req = createMockReq({
        params: { id: 'order-1' },
        body: { status: 'READY' },
        user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
      });
      const res = createMockRes();

      await updateOrderStatus(req, res, next);

      expect(prisma.order.update).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
    },
  );

  it('records the cashier on the status event and claims processedBy once', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'cashier-b',
      name: 'Cashier B',
      isActive: true,
      role: { name: 'CASHIER' },
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValue(baseOrder as never);
    const updated = { ...baseOrder, status: 'READY' };
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'READY', note: 'Ready' },
      user: { sub: 'cashier-b', type: 'admin', role: 'CASHIER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statusEvents: {
            create: {
              status: 'READY',
              note: 'Ready',
              actorAdminId: 'cashier-b',
              actorName: 'Cashier B',
              actorRole: 'CASHIER',
            },
          },
        }),
      }),
    );
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', processedByAdminId: null },
      data: expect.objectContaining({
        processedByAdminId: 'cashier-b',
        processedByName: 'Cashier B',
      }),
    });
  });

  it('does not record a system admin as the order actor', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(baseOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({ ...baseOrder, status: 'READY' } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { status: 'READY' },
      user: { sub: 'sys-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await updateOrderStatus(req, res, next);

    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statusEvents: { create: { status: 'READY', note: undefined } },
        }),
      }),
    );
  });
});
