import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findFirst: vi.fn(),
    },
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

vi.mock('../../src/lib/onlineOrderPayment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/onlineOrderPayment')>();
  return {
    ...actual,
    markOnlineOrderPaid: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../src/lib/orderSchema', () => ({
  cancelOrderOnPaymentFailure: vi.fn(),
}));

vi.mock('../../src/lib/walletSecurityAudit', () => ({
  logWalletSecurityEvent: vi.fn(),
}));

import { getPaymentAdapter } from '../../src/integrations/paymentAdapter';
import { logWalletSecurityEvent } from '../../src/lib/walletSecurityAudit';
import { markOnlineOrderPaid } from '../../src/lib/onlineOrderPayment';
import { prisma } from '../../src/lib/prisma';
import { processPayHerePaymentNotification } from '../../src/lib/payherePayment';

const baseOrder = {
  id: 'order-1',
  orderNumber: 'BC260722-1001',
  total: 1500,
  paymentStatus: 'PENDING',
};

describe('processPayHerePaymentNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.order.findFirst).mockResolvedValue(baseOrder as never);
    vi.mocked(getPaymentAdapter).mockResolvedValue({
      verifyNotifyHash: vi.fn().mockReturnValue(true),
    } as never);
  });

  it('returns INVALID when PayHere amount does not match order total', async () => {
    const result = await processPayHerePaymentNotification({
      merchant_id: 'merchant',
      order_id: baseOrder.orderNumber,
      payment_id: 'pay-1',
      payhere_amount: '1499.00',
      payhere_currency: 'LKR',
      status_code: '2',
      md5sig: 'sig',
    });

    expect(result).toBe('INVALID');
    expect(markOnlineOrderPaid).not.toHaveBeenCalled();
    expect(logWalletSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'payment.payhere.notify_invalid',
        reason: 'amount_mismatch',
        orderNumber: baseOrder.orderNumber,
      }),
    );
  });

  it('returns INVALID when currency is not LKR', async () => {
    const result = await processPayHerePaymentNotification({
      merchant_id: 'merchant',
      order_id: baseOrder.orderNumber,
      payment_id: 'pay-1',
      payhere_amount: '1500.00',
      payhere_currency: 'USD',
      status_code: '2',
      md5sig: 'sig',
    });

    expect(result).toBe('INVALID');
    expect(markOnlineOrderPaid).not.toHaveBeenCalled();
  });

  it('marks paid when signature and amount match', async () => {
    const result = await processPayHerePaymentNotification({
      merchant_id: 'merchant',
      order_id: baseOrder.orderNumber,
      payment_id: 'pay-1',
      payhere_amount: '1500.00',
      payhere_currency: 'LKR',
      status_code: '2',
      md5sig: 'sig',
    });

    expect(result).toBe('PAID');
    expect(markOnlineOrderPaid).toHaveBeenCalledWith(
      expect.objectContaining({ id: baseOrder.id }),
      { paymentRef: 'pay-1' },
    );
  });
});
