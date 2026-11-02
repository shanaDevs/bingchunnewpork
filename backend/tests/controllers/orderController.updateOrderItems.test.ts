import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

const ITEM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    topping: {
      findMany: vi.fn(),
    },
    storeProduct: {
      findUnique: vi.fn().mockResolvedValue({
        stock: 10,
        lowStockThreshold: 25,
        onlineOutOfStockThreshold: 5,
      }),
    },
    adminUser: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    assertOrderStoreAccess: vi.fn(),
  };
});

vi.mock('../../src/lib/appSchema', () => ({
  getPickupOrderEditSettings: vi.fn().mockResolvedValue({
    allowAddItemsPaidOnline: true,
    allowEditCashUnpaid: true,
  }),
}));

vi.mock('../../src/lib/pricing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/pricing')>();
  return {
    ...actual,
    computeUnitPrice: vi.fn(),
    batchResolveLinePricing: vi.fn(),
  };
});

vi.mock('../../src/repositories/inventoryReservationRepository', () => ({
  validateStockAvailabilityInTx: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/batchStockEngine', () => ({
  consumeFifo: vi.fn().mockResolvedValue(undefined),
  getEffectiveThresholds: vi.fn().mockReturnValue({
    lowStockThreshold: 25,
    onlineOutOfStockThreshold: 5,
  }),
}));

vi.mock('../../src/lib/stockEngine', () => ({
  checkAndEmitThresholds: vi.fn().mockResolvedValue(undefined),
  orderStockWasDeducted: vi.fn().mockResolvedValue(false),
}));

import { updateOrderItems } from '../../src/controllers/orderController';
import { getPickupOrderEditSettings } from '../../src/lib/appSchema';
import { batchResolveLinePricing, computeUnitPrice } from '../../src/lib/pricing';
import { prisma } from '../../src/lib/prisma';
import { assertOrderStoreAccess } from '../../src/middleware/auth';
import { AppError } from '../../src/middleware/errorHandler';

const unpaidTakeawayOrder = {
  id: 'order-1',
  orderNumber: 'BC260722-1001',
  storeId: 'store-1',
  orderMode: 'TAKEAWAY',
  paymentMethod: 'CASH_AT_COUNTER',
  paymentStatus: 'PENDING',
  status: 'PREPARING',
  total: 1000,
  subtotal: 1000,
  deliveryFee: 0,
  discount: 0,
  loyaltyDiscount: 0,
  convenientFee: 0,
  items: [
    {
      id: ITEM_ID,
      productId: 'prod-1',
      unitPrice: 500,
      quantity: 2,
      totalPrice: 1000,
      toppings: [],
    },
  ],
};

const paidTakeawayOrder = {
  ...unpaidTakeawayOrder,
  paymentStatus: 'PAID',
  prepaidAmount: 1000,
  items: [
    {
      id: ITEM_ID,
      productId: 'prod-1',
      unitPrice: 500,
      quantity: 2,
      totalPrice: 1000,
      toppings: [],
    },
    {
      id: ITEM_ID_2,
      productId: 'prod-2',
      unitPrice: 300,
      quantity: 1,
      totalPrice: 300,
      toppings: [],
    },
  ],
  total: 1300,
  subtotal: 1300,
};

function mockTransaction(overrides: {
  allItems?: Array<{ id: string; totalPrice: number }>;
  failWith?: Error;
} = {}) {
  const tx = {
    orderItem: {
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: 'new-item' }),
      findMany: vi.fn().mockResolvedValue(
        overrides.allItems ?? [{ id: ITEM_ID, totalPrice: 750 }],
      ),
    },
    order: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    orderStatusEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  if (overrides.failWith) {
    vi.mocked(prisma.$transaction).mockRejectedValue(overrides.failWith);
    return tx;
  }

  vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
    callback(tx as never),
  );
  return tx;
}

describe('updateOrderItems', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertOrderStoreAccess).mockResolvedValue(undefined);
    vi.mocked(getPickupOrderEditSettings).mockResolvedValue({
      allowAddItemsPaidOnline: true,
      allowEditCashUnpaid: true,
    });
    vi.mocked(prisma.topping.findMany).mockResolvedValue([]);
    vi.mocked(batchResolveLinePricing).mockImplementation(async (lines) => {
      const map = new Map<
        string,
        { unitPrice: number; toppings: Array<{ toppingId: string; topping: { id: string; name: string; extraPrice: number } }> }
      >();
      for (const line of lines) {
        map.set(`${line.productId}:${line.size}:${line.toppingIds.join(',')}`, {
          unitPrice: 450,
          toppings: line.toppingIds.map((id) => ({
            toppingId: id,
            topping: { id, name: 'Pearl', extraPrice: 50 },
          })),
        });
      }
      return map;
    });
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'prod-3', name: 'Milk Tea', isAvailable: true },
    ] as never);
  });

  it('performs a full item update on unpaid cash takeaway orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(unpaidTakeawayOrder as never);
    const tx = mockTransaction({ allItems: [{ id: ITEM_ID, totalPrice: 750 }] });
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...unpaidTakeawayOrder,
      total: 750,
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {
        items: [{ orderItemId: ITEM_ID, quantity: 1 }],
      },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(assertOrderStoreAccess).toHaveBeenCalledWith(req, 'store-1');
    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { quantity: 1, totalPrice: 500 },
    });
    expect(tx.orderItem.deleteMany).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('records actor on item-edit events but does not claim processedBy', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-1',
      name: 'Cashier A',
      isActive: true,
      role: { name: 'CASHIER' },
    } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(unpaidTakeawayOrder as never);
    const tx = mockTransaction({ allItems: [{ id: ITEM_ID, totalPrice: 750 }] });
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...unpaidTakeawayOrder,
      total: 750,
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {
        items: [{ orderItemId: ITEM_ID, quantity: 1 }],
      },
      user: { sub: 'admin-1', type: 'admin', role: 'CASHIER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.orderStatusEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorAdminId: 'admin-1',
        actorName: 'Cashier A',
        actorRole: 'CASHIER',
      }),
    });
    expect(res.json).toHaveBeenCalled();
  });

  it('allows add-only updates on paid takeaway orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(paidTakeawayOrder as never);
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'prod-3',
      name: 'Milk Tea',
      isAvailable: true,
    } as never);
    vi.mocked(computeUnitPrice).mockResolvedValue(450);
    const tx = mockTransaction({
      allItems: [
        { id: ITEM_ID, totalPrice: 1000 },
        { id: ITEM_ID_2, totalPrice: 300 },
        { id: 'new-item', totalPrice: 450 },
      ],
    });
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...paidTakeawayOrder,
      total: 1750,
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {
        items: [
          { orderItemId: ITEM_ID, quantity: 2 },
          { orderItemId: ITEM_ID_2, quantity: 1 },
          { productId: 'prod-3', size: 'REGULAR', toppingIds: [], quantity: 1 },
        ],
      },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(tx.orderItem.create).toHaveBeenCalled();
    expect(tx.orderItem.deleteMany).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('rejects removing items from a paid order in add-only mode', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(paidTakeawayOrder as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {
        items: [{ orderItemId: ITEM_ID, quantity: 2 }],
      },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Cannot remove items from a paid order',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unknown order item ids', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(unpaidTakeawayOrder as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {
        items: [{ orderItemId: ITEM_ID_2, quantity: 1 }],
      },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toContain('Order item not found');
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(400);
  });

  it('rejects duplicate order item entries in the request', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(unpaidTakeawayOrder as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {
        items: [
          { orderItemId: ITEM_ID, quantity: 1 },
          { orderItemId: ITEM_ID, quantity: 2 },
        ],
      },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Duplicate order item in request');
  });

  it('forwards validation errors when items array is empty', async () => {
    const req = createMockReq({
      params: { id: 'order-1' },
      body: { items: [] },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('denies edits on delivery orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...unpaidTakeawayOrder,
      orderMode: 'DELIVERY',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { items: [{ orderItemId: ITEM_ID, quantity: 1 }] },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks cross-branch access', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(unpaidTakeawayOrder as never);
    vi.mocked(assertOrderStoreAccess).mockRejectedValue(
      new AppError('You can only manage orders for your branch', 403),
    );

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { items: [{ orderItemId: ITEM_ID, quantity: 1 }] },
      user: { sub: 'admin-2', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-2' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

    const req = createMockReq({
      params: { id: 'missing-order' },
      body: { items: [{ orderItemId: ITEM_ID, quantity: 1 }] },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Order not found');
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('propagates prisma transaction failures', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(unpaidTakeawayOrder as never);
    mockTransaction({ failWith: new Error('Transaction failed') });

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { items: [{ orderItemId: ITEM_ID, quantity: 1 }] },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects decreasing quantity on a paid order in add-only mode', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(paidTakeawayOrder as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {
        items: [
          { orderItemId: ITEM_ID, quantity: 1 }, // was 2 -> decreasing
          { orderItemId: ITEM_ID_2, quantity: 1 },
        ],
      },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Cannot decrease quantity on a paid order',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('denies edits on an unpaid cash order when allowEditCashUnpaid is disabled', async () => {
    vi.mocked(getPickupOrderEditSettings).mockResolvedValue({
      allowAddItemsPaidOnline: true,
      allowEditCashUnpaid: false,
    });
    vi.mocked(prisma.order.findFirst).mockResolvedValue(unpaidTakeawayOrder as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { items: [{ orderItemId: ITEM_ID, quantity: 1 }] },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Cash pickup order editing is disabled in settings',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('denies add-items on a paid online order when allowAddItemsPaidOnline is disabled', async () => {
    vi.mocked(getPickupOrderEditSettings).mockResolvedValue({
      allowAddItemsPaidOnline: false,
      allowEditCashUnpaid: true,
    });
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...unpaidTakeawayOrder,
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PAID',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { items: [{ orderItemId: ITEM_ID, quantity: 2 }] },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Adding items to paid online orders is disabled in settings',
    );
  });

  it('denies edits on unpaid online orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...unpaidTakeawayOrder,
      paymentMethod: 'CARD',
      paymentStatus: 'PENDING',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { items: [{ orderItemId: ITEM_ID, quantity: 1 }] },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Unpaid online orders cannot be edited — wait for payment or cancel',
    );
  });

  it('denies edits on cancelled orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...unpaidTakeawayOrder,
      status: 'CANCELLED',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { items: [{ orderItemId: ITEM_ID, quantity: 1 }] },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Completed or cancelled orders cannot be edited',
    );
  });

  it('denies edits on delivered orders', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...unpaidTakeawayOrder,
      status: 'DELIVERED',
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { items: [{ orderItemId: ITEM_ID, quantity: 1 }] },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Completed or cancelled orders cannot be edited',
    );
  });

  it('removes an existing item during a full edit on an unpaid cash order', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...unpaidTakeawayOrder,
      items: [
        { id: ITEM_ID, productId: 'prod-1', unitPrice: 500, quantity: 2, totalPrice: 1000, toppings: [] },
        { id: ITEM_ID_2, productId: 'prod-2', unitPrice: 300, quantity: 1, totalPrice: 300, toppings: [] },
      ],
    } as never);
    const tx = mockTransaction({ allItems: [{ id: ITEM_ID, totalPrice: 1000 }] });
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...unpaidTakeawayOrder,
      total: 1000,
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { items: [{ orderItemId: ITEM_ID, quantity: 2 }] },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(tx.orderItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [ITEM_ID_2] } } });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when a full edit removes items and the transaction reports zero remaining items', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...unpaidTakeawayOrder,
      items: [
        { id: ITEM_ID, productId: 'prod-1', unitPrice: 500, quantity: 2, totalPrice: 1000, toppings: [] },
        { id: ITEM_ID_2, productId: 'prod-2', unitPrice: 300, quantity: 1, totalPrice: 300, toppings: [] },
      ],
    } as never);
    mockTransaction({ allItems: [] });

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { items: [{ orderItemId: ITEM_ID, quantity: 1 }] },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Order must contain at least one item');
  });

  it('creates new order items with toppings when adding a line to a paid order', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(paidTakeawayOrder as never);
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'prod-3',
      name: 'Milk Tea',
      isAvailable: true,
    } as never);
    vi.mocked(computeUnitPrice).mockResolvedValue(550);
    vi.mocked(prisma.topping.findMany).mockResolvedValue([
      { id: 'topping-1', name: 'Pearl', extraPrice: 50 },
    ] as never);
    const tx = mockTransaction({
      allItems: [
        { id: ITEM_ID, totalPrice: 1000 },
        { id: ITEM_ID_2, totalPrice: 300 },
        { id: 'new-item', totalPrice: 550 },
      ],
    });
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...paidTakeawayOrder,
      total: 1850,
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {
        items: [
          { orderItemId: ITEM_ID, quantity: 2 },
          { orderItemId: ITEM_ID_2, quantity: 1 },
          { productId: 'prod-3', size: 'REGULAR', toppingIds: ['topping-1'], quantity: 1 },
        ],
      },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(tx.orderItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        productId: 'prod-3',
        toppings: {
          create: [{ toppingId: 'topping-1', toppingName: 'Pearl', extraPrice: 50 }],
        },
      }),
    });
  });

  it('recomputes subtotal and total from the post-transaction item totals', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...unpaidTakeawayOrder,
      deliveryFee: 100,
      discount: 50,
      loyaltyDiscount: 20,
    } as never);
    const tx = mockTransaction({ allItems: [{ id: ITEM_ID, totalPrice: 500 }] });
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...unpaidTakeawayOrder,
      total: 530,
      items: [],
    } as never);

    const req = createMockReq({
      params: { id: 'order-1' },
      body: { items: [{ orderItemId: ITEM_ID, quantity: 1 }] },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    // subtotal = 500 (sum of allItems totalPrice); total = 500 + 100(fee) - 50(discount) - 20(loyalty) = 530
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({ subtotal: 500, convenientFee: 0, total: 530 }),
    });
  });

  it('rejects adding an unavailable product as a new line', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(paidTakeawayOrder as never);
    vi.mocked(batchResolveLinePricing).mockRejectedValue(new AppError('Milk Tea is currently unavailable', 400));

    const req = createMockReq({
      params: { id: 'order-1' },
      body: {
        items: [
          { orderItemId: ITEM_ID, quantity: 2 },
          { orderItemId: ITEM_ID_2, quantity: 1 },
          { productId: 'prod-3', size: 'REGULAR', toppingIds: [], quantity: 1 },
        ],
      },
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateOrderItems(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Milk Tea is currently unavailable');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
