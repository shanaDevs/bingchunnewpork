import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    refund: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/lib/customerNotifications', () => ({
  notifyCustomerOrderStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/messaging/messagingNotificationService', () => ({
  notifyMessagingOrderStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/deliveryJobHelpers', () => ({
  maybeAutoCompleteDeliveryJobsForOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/driverOrderAlerts', () => ({
  notifyDriverOrderCancelled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/publishOrderIntegrationEvent', () => ({
  publishOrderCancelledEvent: vi.fn().mockResolvedValue(false),
  publishOrderStatusChangedEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/stockEngine', () => ({
  restoreOrderItems: vi.fn().mockResolvedValue(undefined),
  orderStockWasDeducted: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../src/lib/orderSchema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/orderSchema')>();
  return {
    ...actual,
    ensureOrderDeliveryColumns: vi.fn().mockResolvedValue(undefined),
    getCancelWindowStartsAt: vi.fn().mockResolvedValue(null),
    getCancelWindowStartsAtMap: vi.fn().mockResolvedValue(new Map()),
    stampCancelWindowStart: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../src/lib/appSchema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/appSchema')>();
  return {
    ...actual,
    getCancelWindowMinutes: vi.fn().mockResolvedValue(10),
  };
});

vi.mock('../../src/lib/cancelReasonConfig', () => ({
  validateActiveCancellationReason: vi.fn().mockImplementation(async (value: string) => ({
    id: `reason-${value}`,
    label: value.replace(/_/g, ' '),
    value,
    minRefundPercentage: 80,
    maxRefundPercentage: 100,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  OTHER_CANCEL_REASON_VALUE: 'OTHER',
}));

vi.mock('../../src/lib/orderStatusRefundConfig', () => ({
  getRefundPercentageForStatus: vi.fn().mockResolvedValue(100),
  getOrderStatusRefundPercentageMap: vi.fn().mockResolvedValue(new Map([
    ['RECEIVED', 100],
    ['PREPARING', 80],
    ['READY', 60],
    ['OUT_FOR_DELIVERY', 40],
  ])),
}));

import { cancelOrderByCustomer } from '../../src/controllers/orderController';
import { notifyCustomerOrderStatus } from '../../src/lib/customerNotifications';
import { notifyMessagingOrderStatus } from '../../src/services/messaging/messagingNotificationService';
import { maybeAutoCompleteDeliveryJobsForOrder } from '../../src/lib/deliveryJobHelpers';
import { notifyDriverOrderCancelled } from '../../src/lib/driverOrderAlerts';
import { publishOrderCancelledEvent } from '../../src/lib/publishOrderIntegrationEvent';
import { orderStockWasDeducted, restoreOrderItems } from '../../src/lib/stockEngine';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';
import { CUSTOMER_CANCEL_WINDOW_MS } from '../../src/lib/orderCancel';
import { getRefundPercentageForStatus } from '../../src/lib/orderStatusRefundConfig';

const now = new Date('2026-08-17T12:00:00.000Z');

const baseOrder = {
  id: 'order-1',
  orderNumber: 'BC260817-6850',
  trackToken: 'track-secret-cancel',
  storeId: 'store-1',
  status: 'RECEIVED',
  orderMode: 'TAKEAWAY',
  paymentMethod: 'CASH_AT_COUNTER',
  paymentStatus: 'PENDING',
  subtotal: 1500,
  discount: 0,
  loyaltyDiscount: 0,
  deliveryFee: 0,
  total: 1500,
  convenientFee: 0,
  userId: 'user-1',
  channel: 'WEB',
  createdAt: new Date(now.getTime() - 60 * 1000),
  items: [{ productId: 'product-1', quantity: 1 }],
  statusEvents: [],
  store: { id: 'store-1', name: 'Nugegoda', addressLine: '1 Main St', lat: 0, lng: 0 },
  address: null,
  user: { name: 'Jane', phone: '0771234567' },
  platformRating: null,
};

describe('cancelOrderByCustomer', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(publishOrderCancelledEvent).mockResolvedValue(false);
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels a RECEIVED order within the 10-minute window via public track token', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(baseOrder as never);
    const cancelled = {
      ...baseOrder,
      status: 'CANCELLED',
      cancelReason: 'CUSTOMER_REQUEST',
      cancelledBy: 'customer',
    };
    
    // Mock the transaction callback
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue(cancelled),
        },
        refund: {
          create: vi.fn().mockResolvedValue({ id: 'refund-1' }),
        },
      };
      return await callback(tx);
    });

    const req = createMockReq({
      params: { id: 'track-secret-cancel' },
      body: { cancellationReason: 'CHANGED_MIND' },
      user: undefined,
    });
    const res = createMockRes();

    await cancelOrderByCustomer(req, res, next);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(notifyCustomerOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1', status: 'CANCELLED' }),
    );
    expect(notifyMessagingOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1', status: 'CANCELLED' }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          status: 'CANCELLED',
          canCancel: false,
          cancelWindowEndsAt: null,
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('uses full-refund note even at 9 minutes for paid online orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...baseOrder,
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PAID',
      convenientFee: 100,
      createdAt: new Date(now.getTime() - 9 * 60 * 1000),
    } as never);
    
    const cancelled = {
      ...baseOrder,
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PAID',
      convenientFee: 100,
      status: 'CANCELLED',
      createdAt: new Date(now.getTime() - 9 * 60 * 1000),
    };
    
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue(cancelled),
        },
        refund: {
          create: vi.fn().mockResolvedValue({ id: 'refund-1' }),
        },
      };
      return await callback(tx);
    });

    const req = createMockReq({
      params: { id: 'track-secret-cancel' },
      body: { cancellationReason: 'TAKING_TOO_LONG' },
      user: undefined,
    });
    const res = createMockRes();

    await cancelOrderByCustomer(req, res, next);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('allows cancel after 10 minutes with partial refund note', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...baseOrder,
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PAID',
      convenientFee: 100,
      createdAt: new Date(now.getTime() - 15 * 60 * 1000),
    } as never);
    
    const cancelled = {
      ...baseOrder,
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PAID',
      convenientFee: 100,
      status: 'CANCELLED',
      createdAt: new Date(now.getTime() - 15 * 60 * 1000),
    };
    
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue(cancelled),
        },
        refund: {
          create: vi.fn().mockResolvedValue({ id: 'refund-1' }),
        },
      };
      return await callback(tx);
    });

    const req = createMockReq({
      params: { id: 'track-secret-cancel' },
      body: { cancellationReason: 'ORDERED_BY_MISTAKE' },
      user: undefined,
    });
    const res = createMockRes();

    await cancelOrderByCustomer(req, res, next);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it.each(['READY', 'OUT_FOR_DELIVERY'] as const)(
    'cancels a %s delivery order after dispatch',
    async (status) => {
      vi.mocked(prisma.order.findFirst).mockResolvedValue({
        ...baseOrder,
        status,
        orderMode: 'DELIVERY',
      } as never);

      const cancelled = {
        ...baseOrder,
        status: 'CANCELLED',
        orderMode: 'DELIVERY',
        cancelReason: 'CUSTOMER_REQUEST',
        cancelledBy: 'customer',
      };

      let updateArgs: { data?: { cancelledAtStatus?: string } } | undefined;
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          order: {
            update: vi.fn().mockImplementation((args) => {
              updateArgs = args;
              return Promise.resolve(cancelled);
            }),
          },
          refund: {
            create: vi.fn().mockResolvedValue({ id: 'refund-1' }),
          },
        };
        return await callback(tx);
      });

      const req = createMockReq({
        params: { id: 'track-secret-cancel' },
        body: { cancellationReason: 'CHANGED_MIND' },
        user: undefined,
      });
      const res = createMockRes();

      await cancelOrderByCustomer(req, res, next);

      expect(updateArgs?.data?.cancelledAtStatus).toBe(status);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(notifyDriverOrderCancelled).toHaveBeenCalledWith('order-1', {
        cancelledBy: 'customer',
      });
      expect(maybeAutoCompleteDeliveryJobsForOrder).toHaveBeenCalledWith('order-1');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
      expect(next).not.toHaveBeenCalled();
    },
  );

  it('rejects cancellation when order is already delivered', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...baseOrder,
      status: 'DELIVERED',
    } as never);

    const req = createMockReq({
      params: { id: 'track-secret-cancel' },
      body: { cancellationReason: 'CHANGED_MIND' },
      user: undefined,
    });
    const res = createMockRes();

    await cancelOrderByCustomer(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'This order can no longer be cancelled',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('forbids UUID lookup by a non-owner customer', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(baseOrder as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { cancellationReason: 'CHANGED_MIND' },
      user: { sub: 'other-user', type: 'customer' },
    });
    const res = createMockRes();

    await cancelOrderByCustomer(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('restores stock when it was deducted before cancellation', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(baseOrder as never);
    vi.mocked(orderStockWasDeducted).mockResolvedValue(true);
    
    const cancelled = {
      ...baseOrder,
      status: 'CANCELLED',
    };
    
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue(cancelled),
        },
        refund: {
          create: vi.fn().mockResolvedValue({ id: 'refund-1' }),
        },
      };
      return await callback(tx);
    });

    const req = createMockReq({
      params: { id: 'track-secret-cancel' },
      body: { cancellationReason: 'CHANGED_MIND' },
      user: undefined,
    });
    const res = createMockRes();

    await cancelOrderByCustomer(req, res, next);

    expect(restoreOrderItems).toHaveBeenCalledWith('store-1', 'order-1');
    expect(res.json).toHaveBeenCalled();
  });

  it('auto-completes delivery jobs for delivery orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...baseOrder,
      orderMode: 'DELIVERY',
    } as never);
    
    const cancelled = {
      ...baseOrder,
      orderMode: 'DELIVERY',
      status: 'CANCELLED',
    };
    
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue(cancelled),
        },
        refund: {
          create: vi.fn().mockResolvedValue({ id: 'refund-1' }),
        },
      };
      return await callback(tx);
    });

    const req = createMockReq({
      params: { id: 'track-secret-cancel' },
      body: { cancellationReason: 'CHANGED_MIND' },
      user: undefined,
    });
    const res = createMockRes();

    await cancelOrderByCustomer(req, res, next);

    expect(maybeAutoCompleteDeliveryJobsForOrder).toHaveBeenCalledWith('order-1');
  });

  it('rings the rider from core when the cancel event was not published', async () => {
    vi.mocked(publishOrderCancelledEvent).mockResolvedValue(false);
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...baseOrder,
      orderMode: 'DELIVERY',
    } as never);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue({
            ...baseOrder,
            orderMode: 'DELIVERY',
            status: 'CANCELLED',
          }),
        },
        refund: { create: vi.fn().mockResolvedValue({ id: 'refund-1' }) },
      };
      return await callback(tx);
    });

    const req = createMockReq({
      params: { id: 'track-secret-cancel' },
      body: { cancellationReason: 'CHANGED_MIND' },
      user: undefined,
    });

    await cancelOrderByCustomer(req, createMockRes(), next);

    expect(notifyDriverOrderCancelled).toHaveBeenCalledWith('order-1', {
      cancelledBy: 'customer',
    });
    expect(maybeAutoCompleteDeliveryJobsForOrder).toHaveBeenCalledWith('order-1');
  });

  it('does not ring from core when the cancel event was published', async () => {
    vi.mocked(publishOrderCancelledEvent).mockResolvedValue(true);
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...baseOrder,
      orderMode: 'DELIVERY',
    } as never);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue({
            ...baseOrder,
            orderMode: 'DELIVERY',
            status: 'CANCELLED',
          }),
        },
        refund: { create: vi.fn().mockResolvedValue({ id: 'refund-1' }) },
      };
      return await callback(tx);
    });

    const req = createMockReq({
      params: { id: 'track-secret-cancel' },
      body: { cancellationReason: 'CHANGED_MIND' },
      user: undefined,
    });

    await cancelOrderByCustomer(req, createMockRes(), next);

    expect(notifyDriverOrderCancelled).not.toHaveBeenCalled();
    expect(maybeAutoCompleteDeliveryJobsForOrder).toHaveBeenCalledWith('order-1');
  });

  it('does not ring anyone for a takeaway cancellation', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...baseOrder,
      orderMode: 'TAKEAWAY',
    } as never);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue({
            ...baseOrder,
            orderMode: 'TAKEAWAY',
            status: 'CANCELLED',
          }),
        },
        refund: { create: vi.fn().mockResolvedValue({ id: 'refund-1' }) },
      };
      return await callback(tx);
    });

    const req = createMockReq({
      params: { id: 'track-secret-cancel' },
      body: { cancellationReason: 'CHANGED_MIND' },
      user: undefined,
    });

    await cancelOrderByCustomer(req, createMockRes(), next);

    expect(notifyDriverOrderCancelled).not.toHaveBeenCalled();
  });

  it('creates a refund record with cancellation reason', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...baseOrder,
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PAID',
      convenientFee: 100,
    } as never);
    
    let refundCreateArgs: any;
    const cancelled = {
      ...baseOrder,
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PAID',
      convenientFee: 100,
      status: 'CANCELLED',
    };
    
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue(cancelled),
        },
        refund: {
          create: vi.fn().mockImplementation((args) => {
            refundCreateArgs = args;
            return Promise.resolve({ id: 'refund-1' });
          }),
        },
      };
      return await callback(tx);
    });

    const req = createMockReq({
      params: { id: 'track-secret-cancel' },
      body: { cancellationReason: 'OTHER', customReasonText: 'My custom reason' },
      user: undefined,
    });
    const res = createMockRes();

    await cancelOrderByCustomer(req, res, next);

    expect(refundCreateArgs).toMatchObject({
      data: expect.objectContaining({
        orderId: 'order-1',
        cancellationReason: 'OTHER',
        customReasonText: 'My custom reason',
        cancelledWithinWindow: true,
        cancelledAtStatus: 'RECEIVED',
        configuredStatusRefundPercentage: 100,
        refundAmount: 1500,
        refundPercentage: 100,
        status: 'RECEIVED',
      }),
    });
  });

  it('sets status-based partial refund percentage when cancelling after the window', async () => {
    vi.mocked(getRefundPercentageForStatus).mockResolvedValue(80);

    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...baseOrder,
      status: 'PREPARING',
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PAID',
      convenientFee: 100,
      total: 1600,
      createdAt: new Date(now.getTime() - 15 * 60 * 1000),
    } as never);

    let refundCreateArgs: any;
    const cancelled = {
      ...baseOrder,
      status: 'CANCELLED',
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PAID',
      convenientFee: 100,
      total: 1600,
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue(cancelled),
        },
        refund: {
          create: vi.fn().mockImplementation((args) => {
            refundCreateArgs = args;
            return Promise.resolve({ id: 'refund-1' });
          }),
        },
      };
      return await callback(tx);
    });

    const req = createMockReq({
      params: { id: 'track-secret-cancel' },
      body: { cancellationReason: 'TAKING_TOO_LONG' },
      user: undefined,
    });
    const res = createMockRes();

    await cancelOrderByCustomer(req, res, next);

    expect(getRefundPercentageForStatus).toHaveBeenCalledWith('PREPARING');
    expect(refundCreateArgs).toMatchObject({
      data: expect.objectContaining({
        cancelledAtStatus: 'PREPARING',
        configuredStatusRefundPercentage: 80,
        refundPercentage: 80,
        refundAmount: 1200,
        cancelledWithinWindow: false,
      }),
    });
  });
});
