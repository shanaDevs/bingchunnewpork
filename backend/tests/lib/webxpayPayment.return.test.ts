import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRaw, verifyWebXPayReturn } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  verifyWebXPayReturn: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findFirst: vi.fn(),
    },
    get $queryRaw() {
      return queryRaw;
    },
  },
}));

vi.mock('../../src/lib/paymentSettings', () => ({
  getPaymentSettings: vi.fn().mockResolvedValue({
    webxpay: { publicKey: 'pk', secretKey: 'sk', mode: 'sandbox', configured: true },
  }),
  isValidWebXPayCredentials: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/lib/onlineOrderPayment', () => ({
  markOnlineOrderPaid: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/orderSchema', () => ({
  cancelOrderOnPaymentFailure: vi.fn(),
}));

vi.mock('../../src/lib/webxpayPayment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/webxpayPayment')>();
  return {
    ...actual,
    verifyWebXPayReturn,
  };
});

import { markOnlineOrderPaid } from '../../src/lib/onlineOrderPayment';
import { prisma } from '../../src/lib/prisma';
import { processWebXPayReturn } from '../../src/lib/webxpayPayment';

const order = {
  id: 'order-1',
  orderNumber: 'BC-WX-1',
  storeId: 'store-1',
  total: 2000,
  paymentMethod: 'CARD' as const,
  paymentStatus: 'PENDING',
  userId: null,
  orderMode: 'TAKEAWAY',
};

describe('processWebXPayReturn — locked charge amount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.order.findFirst).mockResolvedValue(order as never);
    verifyWebXPayReturn.mockReturnValue({
      valid: true,
      payload: {
        orderId: order.orderNumber,
        reference: 'ref-1',
        timestamp: '1',
        statusCode: '0',
        comment: 'ok',
        gatewayUsed: 'visa',
      },
    });
    queryRaw.mockResolvedValue([{ onlineChargeAmount: 2000 }]);
  });

  it('returns INVALID when locked online charge does not match order total', async () => {
    queryRaw.mockResolvedValue([{ onlineChargeAmount: 1999 }]);

    const result = await processWebXPayReturn({ payment: 'p', signature: 's' });

    expect(result).toBe('INVALID');
    expect(markOnlineOrderPaid).not.toHaveBeenCalled();
  });

  it('rejects when no locked online charge was stored at checkout', async () => {
    queryRaw.mockResolvedValue([{ onlineChargeAmount: null }]);

    const result = await processWebXPayReturn({ payment: 'p', signature: 's' });

    expect(result).toBe('INVALID');
    expect(markOnlineOrderPaid).not.toHaveBeenCalled();
  });
});
