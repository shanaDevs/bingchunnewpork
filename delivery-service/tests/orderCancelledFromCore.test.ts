import { beforeEach, describe, expect, it, vi } from 'vitest';

const publish = vi.fn().mockResolvedValue(undefined);

vi.mock('@bingchun/db', () => ({
  prisma: {
    deliveryJobOrder: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../src/lib/deliveryJobHelpers', () => ({
  heldJobStatuses: vi.fn().mockResolvedValue(['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING']),
  maybeEnterReturningPhase: vi.fn().mockResolvedValue(false),
}));

vi.mock('../src/lib/fcm', () => ({
  sendOrderCancelledToDriver: vi.fn().mockResolvedValue({ tokensSent: 1 }),
}));

vi.mock('../src/sockets/eventPublisher', () => ({
  getEventPublisher: () => ({ publish }),
}));

import { prisma } from '@bingchun/db';
import { maybeEnterReturningPhase } from '../src/lib/deliveryJobHelpers';
import { sendOrderCancelledToDriver } from '../src/lib/fcm';
import { handleCoreOrderCancelled } from '../src/lib/orderCancelledFromCore';

const heldLink = {
  jobId: 'job-1',
  job: { driverId: 'driver-1', storeId: 'store-1' },
  order: { orderNumber: 'BC-1' },
};

describe('handleCoreOrderCancelled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publish.mockResolvedValue(undefined);
    vi.mocked(sendOrderCancelledToDriver).mockResolvedValue({ tokensSent: 1 });
    vi.mocked(maybeEnterReturningPhase).mockResolvedValue(false);
  });

  it('rings the holding rider on socket and with a data-only push', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(heldLink as never);

    await handleCoreOrderCancelled({
      orderId: 'order-1',
      orderMode: 'DELIVERY',
      cancelledBy: 'customer',
    });

    expect(publish).toHaveBeenCalledWith(
      'driver:driver-1',
      'orderCancelled',
      expect.objectContaining({
        jobId: 'job-1',
        orderId: 'order-1',
        orderNumber: 'BC-1',
        storeId: 'store-1',
        cancelledBy: 'customer',
        cancelledAt: expect.any(String),
      }),
    );
    expect(sendOrderCancelledToDriver).toHaveBeenCalledWith('driver-1', {
      jobId: 'job-1',
      orderId: 'order-1',
      orderNumber: 'BC-1',
      cancelledBy: 'customer',
    });
    expect(maybeEnterReturningPhase).toHaveBeenCalledWith('job-1');
  });

  it('does nothing when nobody is holding the order', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(null);

    await handleCoreOrderCancelled({
      orderId: 'order-1',
      orderMode: 'DELIVERY',
      cancelledBy: 'customer',
    });

    expect(publish).not.toHaveBeenCalled();
    expect(sendOrderCancelledToDriver).not.toHaveBeenCalled();
    expect(maybeEnterReturningPhase).not.toHaveBeenCalled();
  });

  it('does not throw when the push fails', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(heldLink as never);
    vi.mocked(sendOrderCancelledToDriver).mockRejectedValue(new Error('fcm down'));

    await expect(
      handleCoreOrderCancelled({
        orderId: 'order-1',
        orderMode: 'DELIVERY',
        cancelledBy: 'customer',
      }),
    ).resolves.toBeUndefined();

    expect(publish).toHaveBeenCalled();
    expect(maybeEnterReturningPhase).toHaveBeenCalledWith('job-1');
  });

  it('ignores a non-delivery cancellation', async () => {
    await handleCoreOrderCancelled({
      orderId: 'order-1',
      orderMode: 'TAKEAWAY',
      cancelledBy: 'customer',
    });

    expect(prisma.deliveryJobOrder.findFirst).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
