import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: { findUnique: vi.fn() },
    customerNotification: { create: vi.fn() },
  },
}));

vi.mock('../../src/lib/socket', () => ({
  getIo: vi.fn(() => ({
    to: vi.fn(() => ({ emit: vi.fn() })),
  })),
}));

vi.mock('../../src/lib/fcm', () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/deliveryCodeLive', () => ({
  clearLiveDeliveryCode: vi.fn().mockResolvedValue(undefined),
  upsertDeliveryCodeLive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/integrations/smsAdapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/integrations/smsAdapter')>();
  return {
    ...actual,
    sendOrderStatusSms: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { notifyCustomerOrderStatus } from '../../src/lib/customerNotifications';
import { sendOrderStatusSms } from '../../src/integrations/smsAdapter';
import { prisma } from '../../src/lib/prisma';

describe('notifyCustomerOrderStatus SMS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      guestPhone: '0771234567',
      user: { phone: null },
    } as never);
    vi.mocked(prisma.customerNotification.create).mockResolvedValue({
      id: 'notif-1',
      createdAt: new Date(),
    } as never);
  });

  it('sends SMS when an order is ready for pickup', async () => {
    await notifyCustomerOrderStatus({
      id: 'order-1',
      orderNumber: 'BC1',
      userId: 'user-1',
      status: 'READY',
      orderMode: 'TAKEAWAY',
    });

    expect(sendOrderStatusSms).toHaveBeenCalledWith('0771234567', 'BC1', 'READY', 'TAKEAWAY');
  });

  it('does not send status SMS for out-for-delivery (handled by delivery-started SMS with PIN)', async () => {
    await notifyCustomerOrderStatus({
      id: 'order-1',
      orderNumber: 'BC1',
      userId: null,
      status: 'OUT_FOR_DELIVERY',
      orderMode: 'DELIVERY',
    });

    expect(sendOrderStatusSms).not.toHaveBeenCalled();
    expect(prisma.customerNotification.create).not.toHaveBeenCalled();
  });

  it('does not send SMS for preparing', async () => {
    await notifyCustomerOrderStatus({
      id: 'order-1',
      orderNumber: 'BC1',
      userId: 'user-1',
      status: 'PREPARING',
      orderMode: 'TAKEAWAY',
    });

    expect(sendOrderStatusSms).not.toHaveBeenCalled();
  });

  it('sends SMS when a delivery order is delivered after customer verification', async () => {
    await notifyCustomerOrderStatus({
      id: 'order-1',
      orderNumber: 'BC1',
      userId: 'user-1',
      status: 'DELIVERED',
      orderMode: 'DELIVERY',
    });

    expect(sendOrderStatusSms).toHaveBeenCalledWith('0771234567', 'BC1', 'DELIVERED', 'DELIVERY');
  });

  it('sends delivered SMS for guest checkout numbers', async () => {
    await notifyCustomerOrderStatus({
      id: 'order-1',
      orderNumber: 'BC1',
      userId: null,
      status: 'DELIVERED',
      orderMode: 'DELIVERY',
    });

    expect(sendOrderStatusSms).toHaveBeenCalledWith('0771234567', 'BC1', 'DELIVERED', 'DELIVERY');
    expect(prisma.customerNotification.create).not.toHaveBeenCalled();
  });

  it('sends SMS when takeaway is marked delivered (pickup complete + receipt)', async () => {
    await notifyCustomerOrderStatus({
      id: 'order-1',
      orderNumber: 'BC1',
      userId: 'user-1',
      status: 'DELIVERED',
      orderMode: 'TAKEAWAY',
    });

    expect(sendOrderStatusSms).toHaveBeenCalledWith('0771234567', 'BC1', 'DELIVERED', 'TAKEAWAY');
  });
});
