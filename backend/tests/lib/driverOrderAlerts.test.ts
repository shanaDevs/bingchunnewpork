import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryJobOrder: { findFirst: vi.fn() },
  },
}));

vi.mock('../../src/lib/socket', () => ({
  broadcastOrderCancelledToDriver: vi.fn(),
}));

vi.mock('../../src/lib/driverPush', () => ({
  sendOrderCancelledToDriver: vi.fn(async () => ({ tokensSent: 1 })),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { notifyDriverOrderCancelled } from '../../src/lib/driverOrderAlerts';
import { DRIVER_HELD_JOB_STATUSES } from '../../src/lib/deliveryJobHelpers';
import { prisma } from '../../src/lib/prisma';
import { broadcastOrderCancelledToDriver } from '../../src/lib/socket';
import { sendOrderCancelledToDriver } from '../../src/lib/driverPush';

const holdingLink = {
  jobId: 'job-1',
  job: { driverId: 'driver-1', storeId: 'store-1' },
  order: { orderNumber: 'BC-1042' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendOrderCancelledToDriver).mockResolvedValue({ tokensSent: 1 } as never);
});

/**
 * A cancelled stop already appears on the rider's run at the next poll; this is what
 * makes their phone ring so they don't drive to a dead address.
 */
describe('notifyDriverOrderCancelled', () => {
  it('only looks for jobs a driver is actually holding', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(null as never);

    await notifyDriverOrderCancelled('order-1');

    const where = (vi.mocked(prisma.deliveryJobOrder.findFirst).mock.calls[0][0] as {
      where: { orderId: string; job: { driverId: unknown; status: { in: string[] } } };
    }).where;
    expect(where.orderId).toBe('order-1');
    expect(where.job.driverId).toEqual({ not: null });
    expect(where.job.status).toEqual({ in: [...DRIVER_HELD_JOB_STATUSES] });
  });

  it('rings the holding rider over both the socket and FCM', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(holdingLink as never);

    await notifyDriverOrderCancelled('order-1', { cancelledBy: 'customer' });

    expect(broadcastOrderCancelledToDriver).toHaveBeenCalledWith('driver-1', {
      jobId: 'job-1',
      orderId: 'order-1',
      orderNumber: 'BC-1042',
      storeId: 'store-1',
      cancelledBy: 'customer',
      cancelledAt: expect.any(String),
    });
    expect(sendOrderCancelledToDriver).toHaveBeenCalledWith('driver-1', {
      jobId: 'job-1',
      orderId: 'order-1',
      orderNumber: 'BC-1042',
      cancelledBy: 'customer',
    });
  });

  it('records who cancelled, so a branch cancel is distinguishable', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(holdingLink as never);

    await notifyDriverOrderCancelled('order-1', { cancelledBy: 'branch' });

    expect(vi.mocked(sendOrderCancelledToDriver).mock.calls[0][1].cancelledBy).toBe('branch');
  });

  it('defaults to the customer when the caller does not say', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(holdingLink as never);

    await notifyDriverOrderCancelled('order-1');

    expect(vi.mocked(sendOrderCancelledToDriver).mock.calls[0][1].cancelledBy).toBe('customer');
  });

  it('stays silent when the job is still unclaimed in the pool', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(null as never);

    await notifyDriverOrderCancelled('order-1');

    expect(broadcastOrderCancelledToDriver).not.toHaveBeenCalled();
    expect(sendOrderCancelledToDriver).not.toHaveBeenCalled();
  });

  it('stays silent for an order that is on no delivery job at all', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(undefined as never);

    await expect(notifyDriverOrderCancelled('takeaway-order')).resolves.toBeUndefined();
    expect(sendOrderCancelledToDriver).not.toHaveBeenCalled();
  });

  it('swallows a push failure — alerting is best-effort, cancellation already committed', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(holdingLink as never);
    vi.mocked(sendOrderCancelledToDriver).mockRejectedValue(new Error('FCM down') as never);

    await expect(notifyDriverOrderCancelled('order-1')).resolves.toBeUndefined();
  });

  it('swallows a lookup failure', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockRejectedValue(new Error('db down') as never);

    await expect(notifyDriverOrderCancelled('order-1')).resolves.toBeUndefined();
  });
});
