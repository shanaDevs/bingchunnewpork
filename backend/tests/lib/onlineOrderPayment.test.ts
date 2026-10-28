import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
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

vi.mock('../../src/lib/orderSchema', () => ({
  clearOrderPaymentFailure: vi.fn().mockResolvedValue(undefined),
  stampCancelWindowStart: vi.fn().mockResolvedValue(undefined),
}));

import { creditWalletForOrder } from '../../src/controllers/walletController';
import { finalizeOrderAfterOnlinePayment } from '../../src/lib/orderPlacement';
import { markOnlineOrderPaid } from '../../src/lib/onlineOrderPayment';
import { prisma } from '../../src/lib/prisma';

const order = {
  id: 'order-1',
  orderNumber: 'BC-1',
  storeId: 'store-1',
  total: 1500,
  paymentMethod: 'PAYHERE' as const,
  userId: 'user-1',
  orderMode: 'DELIVERY',
};

describe('markOnlineOrderPaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
  });

  it('does not mark paid when paymentRef is already used by another order', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: 'other-order',
      orderNumber: 'BC-OTHER',
    } as never);

    await markOnlineOrderPaid(order, { paymentRef: 'gateway-ref-1' });

    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(creditWalletForOrder).not.toHaveBeenCalled();
    expect(finalizeOrderAfterOnlinePayment).not.toHaveBeenCalled();
  });

  it('credits wallet once when payment flips to PAID', async () => {
    await markOnlineOrderPaid(order, { paymentRef: 'gateway-ref-2' });

    expect(prisma.order.updateMany).toHaveBeenCalled();
    expect(creditWalletForOrder).toHaveBeenCalledWith(order.id, order.storeId, order.total, order.paymentMethod);
    expect(finalizeOrderAfterOnlinePayment).toHaveBeenCalledWith(order.id);
  });

  it('still finalizes stock when order was already paid', async () => {
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 });

    await markOnlineOrderPaid(order, { paymentRef: 'gateway-ref-3' });

    expect(creditWalletForOrder).not.toHaveBeenCalled();
    expect(finalizeOrderAfterOnlinePayment).toHaveBeenCalledWith(order.id);
  });
});
