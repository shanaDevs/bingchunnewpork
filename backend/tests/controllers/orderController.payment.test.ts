import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../src/lib/paymentSettings', () => ({
  getPaymentSettings: vi.fn().mockResolvedValue({
    payhere: { merchantId: 'merchant', merchantSecret: 'secret', mode: 'sandbox', configured: true },
  }),
}));

vi.mock('../../src/integrations/paymentAdapter', () => ({
  getPaymentAdapter: vi.fn(),
}));

vi.mock('../../src/controllers/walletController', () => ({
  creditWalletForOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/orderPlacement', () => ({
  finalizeOrderAfterOnlinePayment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/customerNotifications', () => ({
  notifyCustomerOrderPlaced: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/payherePayment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/payherePayment')>();
  return {
    ...actual,
    confirmPayherePopupPayment: vi.fn(),
  };
});

import { confirmPaymentReturn, confirmPayherePopup, paymentNotify } from '../../src/controllers/orderController';
import { creditWalletForOrder } from '../../src/controllers/walletController';
import { notifyCustomerOrderPlaced } from '../../src/lib/customerNotifications';
import { getPaymentAdapter } from '../../src/integrations/paymentAdapter';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';
import { ZodError } from 'zod';

const onlineOrder = {
  id: 'order-1',
  orderNumber: 'BC260722-1001',
  userId: 'user-1',
  storeId: 'store-1',
  orderMode: 'DELIVERY',
  paymentMethod: 'PAYHERE',
  paymentStatus: 'PENDING',
  total: 1500,
  trackToken: 'track-1',
};

describe('paymentNotify', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the order paid and credits the wallet on a valid mock notification', async () => {
    vi.mocked(getPaymentAdapter).mockResolvedValue({
      verify: vi.fn().mockReturnValue(true),
    } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(onlineOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...onlineOrder,
      paymentStatus: 'PAID',
    } as never);

    const req = createMockReq({
      body: {
        merchant_id: 'merchant',
        order_id: 'BC260722-1001',
        payment_id: 'pay_1',
        payhere_amount: '1500.00',
        payhere_currency: 'LKR',
        status_code: '2',
        md5sig: 'mock_sig',
      },
    });
    const res = createMockRes();

    await paymentNotify(req, res, next);

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', paymentStatus: { not: 'PAID' } },
      data: { paymentStatus: 'PAID', paymentRef: 'pay_1', prepaidAmount: 1500 },
    });
    expect(creditWalletForOrder).toHaveBeenCalledWith('order-1', 'store-1', 1500, 'PAYHERE');
    expect(notifyCustomerOrderPlaced).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1', userId: 'user-1' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('OK');
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts numeric status_code 2 in addition to the string form', async () => {
    vi.mocked(getPaymentAdapter).mockResolvedValue({ verify: vi.fn().mockReturnValue(true) } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(onlineOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({ ...onlineOrder, paymentStatus: 'PAID' } as never);

    const req = createMockReq({
      body: {
        order_id: 'BC260722-1001',
        payment_id: 'pay_1',
        payhere_amount: '1500.00',
        payhere_currency: 'LKR',
        status_code: 2,
        md5sig: 'mock_sig',
      },
    });
    const res = createMockRes();

    await paymentNotify(req, res, next);

    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'PAID' }) }),
    );
  });

  it('verifies the payhere hash via adapter.verifyNotifyHash when not a mock signature', async () => {
    const verifyNotifyHash = vi.fn().mockReturnValue(true);
    vi.mocked(getPaymentAdapter).mockResolvedValue({ verifyNotifyHash } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(onlineOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({ ...onlineOrder, paymentStatus: 'PAID' } as never);

    const req = createMockReq({
      body: {
        merchant_id: 'merchant',
        order_id: 'BC260722-1001',
        payment_id: 'pay_1',
        payhere_amount: '1500.00',
        payhere_currency: 'LKR',
        status_code: '2',
        md5sig: 'real-signature-hash',
      },
    });
    const res = createMockRes();

    await paymentNotify(req, res, next);

    expect(verifyNotifyHash).toHaveBeenCalledWith(
      'merchant',
      'BC260722-1001',
      '1500.00',
      'LKR',
      '2',
      'real-signature-hash',
      'secret',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('marks payment FAILED when the status code indicates failure', async () => {
    vi.mocked(getPaymentAdapter).mockResolvedValue({ verify: vi.fn().mockReturnValue(true) } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(onlineOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({ ...onlineOrder, paymentStatus: 'FAILED' } as never);

    const req = createMockReq({
      body: {
        order_id: 'BC260722-1001',
        payment_id: 'pay_1',
        payhere_amount: '1500.00',
        payhere_currency: 'LKR',
        status_code: '-1',
        md5sig: 'mock_sig',
      },
    });
    const res = createMockRes();

    await paymentNotify(req, res, next);

    expect(creditWalletForOrder).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(creditWalletForOrder).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects an invalid payment signature', async () => {
    vi.mocked(getPaymentAdapter).mockResolvedValue({
      verifyNotifyHash: vi.fn().mockReturnValue(false),
    } as never);

    const req = createMockReq({
      body: {
        merchant_id: 'merchant',
        order_id: 'BC260722-1001',
        payment_id: 'pay_1',
        status_code: '2',
        md5sig: 'bad-signature',
      },
    });
    const res = createMockRes();

    await paymentNotify(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid payment signature');
    expect(creditWalletForOrder).not.toHaveBeenCalled();
  });

  it('returns 404 when the referenced order does not exist', async () => {
    vi.mocked(getPaymentAdapter).mockResolvedValue({ verify: vi.fn().mockReturnValue(true) } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

    const req = createMockReq({
      body: {
        order_id: 'missing-order',
        payment_id: 'pay_1',
        status_code: '2',
        md5sig: 'mock_sig',
      },
    });
    const res = createMockRes();

    await paymentNotify(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(getPaymentAdapter).mockResolvedValue({ verify: vi.fn().mockReturnValue(true) } as never);
    vi.mocked(prisma.order.findFirst).mockRejectedValue(new Error('DB unavailable'));

    const req = createMockReq({
      body: { order_id: 'BC260722-1001', payment_id: 'pay_1', status_code: '2', md5sig: 'mock_sig' },
    });
    const res = createMockRes();

    await paymentNotify(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.send).not.toHaveBeenCalled();
  });

  it('propagates payment adapter failures', async () => {
    vi.mocked(getPaymentAdapter).mockRejectedValue(new Error('adapter unavailable'));

    const req = createMockReq({
      body: { order_id: 'BC260722-1001', payment_id: 'pay_1', status_code: '2', md5sig: 'mock_sig' },
    });
    const res = createMockRes();

    await paymentNotify(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rejects notify bodies that fail schema validation before payment processing', async () => {
    const req = createMockReq({
      body: { md5sig: { not: 'a-string' } },
    });
    const res = createMockRes();

    await paymentNotify(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
    expect(getPaymentAdapter).not.toHaveBeenCalled();
  });

  it('rejects a signed notification whose amount does not match the order total', async () => {
    vi.mocked(getPaymentAdapter).mockResolvedValue({
      verify: vi.fn().mockReturnValue(true),
    } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(onlineOrder as never);

    const req = createMockReq({
      body: {
        merchant_id: 'merchant',
        order_id: 'BC260722-1001',
        payment_id: 'pay_1',
        payhere_amount: '1.00',
        payhere_currency: 'LKR',
        status_code: '2',
        md5sig: 'mock_sig',
      },
    });
    const res = createMockRes();

    await paymentNotify(req, res, next);

    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(creditWalletForOrder).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });
});

describe('confirmPaymentReturn', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks an unpaid online order as paid, credits the wallet, and notifies the customer', async () => {
    // confirmPaymentReturn only finalizes payment when return body includes md5sig + status_code.
    vi.mocked(getPaymentAdapter).mockResolvedValue({
      verify: vi.fn().mockReturnValue(true),
    } as never);
    const paidSnapshot = {
      id: 'order-1',
      orderNumber: 'BC260722-1001',
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PAID',
      paymentRef: 'pay_1',
      prepaidAmount: 1500,
      total: 1500,
    };
    vi.mocked(prisma.order.findFirst)
      .mockResolvedValueOnce(onlineOrder as never)
      .mockResolvedValueOnce(onlineOrder as never)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(paidSnapshot as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ paymentStatus: 'PENDING' } as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...onlineOrder,
      paymentStatus: 'PAID',
      paymentRef: 'pay_1',
      prepaidAmount: 1500,
    } as never);

    const req = createMockReq({
      params: { id: 'BC260722-1001' },
      user: { sub: 'user-1', type: 'user' },
      body: {
        merchant_id: 'merchant',
        order_id: 'BC260722-1001',
        payment_id: 'pay_1',
        payhere_amount: '1500.00',
        payhere_currency: 'LKR',
        status_code: '2',
        md5sig: 'mock_sig',
      },
    });
    const res = createMockRes();

    await confirmPaymentReturn(req, res, next);

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', paymentStatus: { not: 'PAID' } },
      data: { paymentStatus: 'PAID', paymentRef: 'pay_1', prepaidAmount: 1500 },
    });
    expect(creditWalletForOrder).toHaveBeenCalledWith('order-1', 'store-1', 1500, 'PAYHERE');
    expect(notifyCustomerOrderPlaced).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'order-1',
        orderNumber: 'BC260722-1001',
        userId: 'user-1',
        orderMode: 'DELIVERY',
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ paymentStatus: 'PAID' }) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('is idempotent when the order is already paid (no duplicate wallet credit)', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...onlineOrder,
      paymentStatus: 'PAID',
    } as never);

    const req = createMockReq({
      params: { id: 'BC260722-1001' },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await confirmPaymentReturn(req, res, next);

    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(creditWalletForOrder).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'PAID' }) }),
    );
  });

  it('rejects confirming payment for an order that does not use online payment', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...onlineOrder,
      paymentMethod: 'CASH_AT_COUNTER',
    } as never);

    const req = createMockReq({
      params: { id: 'BC260722-1001' },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await confirmPaymentReturn(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('This order does not use online payment');
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

    const req = createMockReq({ params: { id: 'missing-order' } });
    const res = createMockRes();

    await confirmPaymentReturn(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('does not notify the customer for guest orders with no linked user', async () => {
    const guestOrder = { ...onlineOrder, userId: null };
    vi.mocked(getPaymentAdapter).mockResolvedValue({
      verify: vi.fn().mockReturnValue(true),
    } as never);
    vi.mocked(prisma.order.findFirst)
      .mockResolvedValueOnce(guestOrder as never)
      .mockResolvedValueOnce(guestOrder as never)
      .mockResolvedValueOnce({
        id: 'order-1',
        orderNumber: 'BC260722-1001',
        paymentMethod: 'PAYHERE',
        paymentStatus: 'PAID',
        paymentRef: 'pay_1',
        prepaidAmount: 1500,
        total: 1500,
      } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ paymentStatus: 'PENDING' } as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...guestOrder,
      paymentStatus: 'PAID',
      paymentRef: 'pay_1',
      prepaidAmount: 1500,
    } as never);

    const req = createMockReq({
      params: { id: 'BC260722-1001' },
      body: {
        order_id: 'BC260722-1001',
        payment_id: 'pay_1',
        payhere_amount: '1500.00',
        payhere_currency: 'LKR',
        status_code: '2',
        md5sig: 'mock_sig',
        trackToken: 'track-1',
      },
    });
    const res = createMockRes();

    await confirmPaymentReturn(req, res, next);

    expect(notifyCustomerOrderPlaced).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.order.findFirst).mockRejectedValue(new Error('DB unavailable'));

    const req = createMockReq({ params: { id: 'order-1' } });
    const res = createMockRes();

    await confirmPaymentReturn(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 403 when neither the owner nor a track token is present', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(onlineOrder as never);

    const req = createMockReq({
      params: { id: 'BC260722-1001' },
      body: {},
    });
    const res = createMockRes();

    await confirmPaymentReturn(req, res, next);

    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects return confirm when PayHere amount does not match order total', async () => {
    vi.mocked(getPaymentAdapter).mockResolvedValue({
      verifyNotifyHash: vi.fn().mockReturnValue(true),
    } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(onlineOrder as never);

    const req = createMockReq({
      params: { id: 'BC260722-1001' },
      user: { sub: 'user-1', type: 'user' },
      body: {
        merchant_id: 'merchant',
        order_id: 'BC260722-1001',
        payment_id: 'pay_1',
        payhere_amount: '1.00',
        payhere_currency: 'LKR',
        status_code: '2',
        md5sig: 'real-signature-hash',
      },
    });
    const res = createMockRes();

    await confirmPaymentReturn(req, res, next);

    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(creditWalletForOrder).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid payment signature');
  });
});

describe('confirmPayherePopup', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when neither the owner nor a track token is present', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(onlineOrder as never);

    const req = createMockReq({
      params: { id: 'BC260722-1001' },
      body: {},
    });
    const res = createMockRes();

    await confirmPayherePopup(req, res, next);

    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(res.json).not.toHaveBeenCalled();
  });
});
