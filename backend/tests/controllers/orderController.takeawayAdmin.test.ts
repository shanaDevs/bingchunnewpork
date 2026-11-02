import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => {
  const order = {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  return {
    prisma: {
      order,
      adminUser: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (client: { order: typeof order }) => unknown) => fn({ order })),
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
  creditWalletAddonPayment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/customerNotifications', () => ({
  notifyCustomerOrderStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/appSchema', () => ({
  getPickupOrderEditSettings: vi.fn().mockResolvedValue({
    allowAddItemsPaidOnline: true,
    allowEditCashUnpaid: true,
  }),
}));

vi.mock('../../src/lib/orderSchema', () => ({
  ensureOrderDeliveryColumns: vi.fn().mockResolvedValue(undefined),
  stampCancelWindowStart: vi.fn().mockResolvedValue(undefined),
}));

import {
  collectOrderPayment,
  completeTakeawayPickup,
  updateOrderContact,
} from '../../src/controllers/orderController';
import { notifyCustomerOrderStatus } from '../../src/lib/customerNotifications';
import { prisma } from '../../src/lib/prisma';
import { creditWalletForOrder, creditWalletAddonPayment } from '../../src/controllers/walletController';
import { assertOrderStoreAccess } from '../../src/middleware/auth';
import { AppError } from '../../src/middleware/errorHandler';

const takeawayOrder = {
  id: 'order-1',
  orderNumber: 'BC260722-1001',
  storeId: 'store-1',
  orderMode: 'TAKEAWAY',
  status: 'READY',
  paymentMethod: 'CASH_AT_COUNTER',
  paymentStatus: 'PENDING',
  total: 1500,
  prepaidAmount: 0,
  userId: 'user-1',
  items: [],
};

describe('completeTakeawayPickup', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertOrderStoreAccess).mockResolvedValue(undefined);
  });

  it('completes an unpaid takeaway pickup and collects payment', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      prepaidAmount: 1500,
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'BC260722-1001' },
      body: { collectPayment: true, cashReceivedAmount: 1500 },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(assertOrderStoreAccess).toHaveBeenCalledWith(req, 'store-1');
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          prepaidAmount: 1500,
        }),
      }),
    );
    expect(creditWalletForOrder).toHaveBeenCalledWith(
      'order-1',
      'store-1',
      1500,
      'CASH_AT_COUNTER',
    );
    expect(notifyCustomerOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DELIVERED' }),
    );
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('completes an already-paid takeaway without collecting payment again', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...takeawayOrder,
      paymentStatus: 'PAID',
      prepaidAmount: 1500,
    } as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { collectPayment: false },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(creditWalletForOrder).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('rejects non-takeaway orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...takeawayOrder,
      orderMode: 'DELIVERY',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {},
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('This is not a takeaway order');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects cancelled or already completed orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {},
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Order already completed');
  });

  it('blocks cross-branch pickup completion', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);
    vi.mocked(assertOrderStoreAccess).mockRejectedValue(
      new AppError('You can only manage orders for your branch', 403),
    );

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {},
      user: { sub: 'admin-2', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-2' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
  });

  it('propagates prisma update failures', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);
    vi.mocked(prisma.order.update).mockRejectedValue(new Error('DB write failed'));

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { cashReceivedAmount: 1500 },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('collects an outstanding balance and credits the addon payment when the order was already paid', async () => {
    const partiallyPrepaidOrder = {
      ...takeawayOrder,
      paymentStatus: 'PAID',
      prepaidAmount: 1000, // total is 1500 -> balanceDue 500
    };
    vi.mocked(prisma.order.findFirst).mockResolvedValue(partiallyPrepaidOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...partiallyPrepaidOrder,
      status: 'DELIVERED',
      prepaidAmount: 1500,
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...partiallyPrepaidOrder,
      status: 'DELIVERED',
      prepaidAmount: 1500,
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { cashReceivedAmount: 500 },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ prepaidAmount: 1500 }),
      }),
    );
    expect(creditWalletAddonPayment).toHaveBeenCalledWith('order-1', 'store-1', 500, 'CASH_AT_COUNTER');
    expect(creditWalletForOrder).not.toHaveBeenCalled();
  });

  it('uses the explicit addon payment method when collecting a balance by card', async () => {
    const partiallyPrepaidOrder = {
      ...takeawayOrder,
      paymentStatus: 'PAID',
      prepaidAmount: 1000,
    };
    vi.mocked(prisma.order.findFirst).mockResolvedValue(partiallyPrepaidOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...partiallyPrepaidOrder,
      status: 'DELIVERED',
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...partiallyPrepaidOrder,
      status: 'DELIVERED',
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { collectBalance: true, paymentMethod: 'CARD' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(creditWalletAddonPayment).toHaveBeenCalledWith('order-1', 'store-1', 500, 'CARD');
  });

  it('rejects picking up a cancelled order', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...takeawayOrder,
      status: 'CANCELLED',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {},
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Order is cancelled');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the pickup order does not exist', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

    const req = createMockReq({
      params: { id: 'missing-order' },
      body: {},
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('marks the order paid by card and updates the payment method on the counter payment note', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentMethod: 'CARD',
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentMethod: 'CARD',
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { collectPayment: true, paymentMethod: 'CARD' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMethod: 'CARD',
          statusEvents: {
            create: {
              status: 'DELIVERED',
              note: 'Picked up & paid at counter (card)',
            },
          },
        }),
      }),
    );
    expect(creditWalletForOrder).toHaveBeenCalledWith('order-1', 'store-1', 1500, 'CARD');
  });

  it('does not collect payment or credit the wallet when collectPayment is false on an unpaid order', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never); // paymentStatus: PENDING
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { collectPayment: false },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: 'PENDING',
          statusEvents: { create: { status: 'DELIVERED', note: 'Picked up at counter' } },
        }),
      }),
    );
    expect(creditWalletForOrder).not.toHaveBeenCalled();
    expect(creditWalletAddonPayment).not.toHaveBeenCalled();
  });

  it('persists cash received and change for cash counter payment', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      cashReceivedAmount: 2000,
      changeGivenAmount: 500,
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      cashReceivedAmount: 2000,
      changeGivenAmount: 500,
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { collectPayment: true, cashReceivedAmount: 2000 },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cashReceivedAmount: 2000,
          changeGivenAmount: 500,
        }),
      }),
    );
    expect(res.json).toHaveBeenCalled();
  });

  it('rejects cash payment when received amount is less than amount due', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { collectPayment: true, cashReceivedAmount: 1000 },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Cash received is less than amount due');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('does not persist cash tender for card payment', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentMethod: 'CARD',
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentMethod: 'CARD',
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { collectPayment: true, paymentMethod: 'CARD', cashReceivedAmount: 2000 },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          cashReceivedAmount: expect.anything(),
          changeGivenAmount: expect.anything(),
        }),
      }),
    );
  });

  it('records the cashier who completed pickup', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'cashier-b',
      name: 'Cashier B',
      isActive: true,
      role: { name: 'CASHIER' },
    } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...takeawayOrder,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { collectPayment: true, cashReceivedAmount: 1500 },
      user: { sub: 'cashier-b', type: 'admin', role: 'CASHIER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await completeTakeawayPickup(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statusEvents: {
            create: expect.objectContaining({
              status: 'DELIVERED',
              actorAdminId: 'cashier-b',
              actorName: 'Cashier B',
              actorRole: 'CASHIER',
            }),
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
});

describe('collectOrderPayment', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertOrderStoreAccess).mockResolvedValue(undefined);
  });

  it('marks an unpaid order as paid and credits the wallet', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...takeawayOrder,
      paymentStatus: 'PAID',
      prepaidAmount: 1500,
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await collectOrderPayment(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({
        paymentStatus: 'PAID',
        prepaidAmount: 1500,
        statusEvents: expect.objectContaining({
          create: expect.objectContaining({
            note: 'Payment collected at counter',
          }),
        }),
      }),
    });
    expect(creditWalletForOrder).toHaveBeenCalledWith(
      'order-1',
      'store-1',
      1500,
      'CASH_AT_COUNTER',
    );
    expect(res.json).toHaveBeenCalled();
  });

  it('records the cashier who collected payment', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'cashier-b',
      name: 'Cashier B',
      isActive: true,
      role: { name: 'CASHIER' },
    } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...takeawayOrder,
      paymentStatus: 'PAID',
      prepaidAmount: 1500,
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      user: { sub: 'cashier-b', type: 'admin', role: 'CASHIER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await collectOrderPayment(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statusEvents: {
            create: expect.objectContaining({
              note: 'Payment collected at counter',
              actorAdminId: 'cashier-b',
              actorName: 'Cashier B',
            }),
          },
        }),
      }),
    );
    expect(prisma.order.updateMany).toHaveBeenCalled();
  });

  it('rejects already paid orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...takeawayOrder,
      paymentStatus: 'PAID',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await collectOrderPayment(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Order is already paid');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects cancelled orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...takeawayOrder,
      status: 'CANCELLED',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await collectOrderPayment(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Order is cancelled');
  });

  it('blocks cross-branch payment collection', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);
    vi.mocked(assertOrderStoreAccess).mockRejectedValue(
      new AppError('You can only manage orders for your branch', 403),
    );

    const req = createMockReq({
      params: { id: 'order-1' },
      user: { sub: 'admin-2', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-2' },
    });
    const res = createMockRes();

    await collectOrderPayment(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
  });

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

    const req = createMockReq({
      params: { id: 'missing-order' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await collectOrderPayment(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Order not found');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});

describe('updateOrderContact', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertOrderStoreAccess).mockResolvedValue(undefined);
  });

  it('updates guest contact details with normalized phone', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);
    const updated = {
      ...takeawayOrder,
      guestName: 'Jane Doe',
      guestPhone: '0771234567',
    };
    vi.mocked(prisma.order.update).mockResolvedValue(updated as never);

    const req = createMockReq({
      params: { id: 'BC260722-1001' },
      body: { guestName: 'Jane Doe', guestPhone: '+94771234567' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderContact(req, res, next);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: { guestName: 'Jane Doe', guestPhone: '0771234567' },
      }),
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
  });

  it('returns 404 when the order is missing', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

    const req = createMockReq({
      params: { id: 'missing' },
      body: { guestName: 'Jane', guestPhone: '0771234567' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderContact(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('forwards validation errors for empty guest name', async () => {
    const req = createMockReq({
      params: { id: 'order-1' },
      body: { guestName: '', guestPhone: '0771234567' },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderContact(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('blocks cross-branch contact updates', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(takeawayOrder as never);
    vi.mocked(assertOrderStoreAccess).mockRejectedValue(
      new AppError('You can only manage orders for your branch', 403),
    );

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { guestName: 'Jane Doe', guestPhone: '0771234567' },
      user: { sub: 'admin-2', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-2' },
    });
    const res = createMockRes();

    await updateOrderContact(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});
