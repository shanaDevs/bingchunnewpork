import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryJobOrder: { findMany: vi.fn() },
    deliveryAttempt: { count: vi.fn(), create: vi.fn() },
    orderStatusEvent: { create: vi.fn() },
    deliveryJob: { update: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    adminUser: { update: vi.fn() },
  },
}));

vi.mock('../../src/lib/socket', () => ({
  broadcastDeliveryJobUpdated: vi.fn(),
}));

vi.mock('../../src/lib/routeCache', () => ({
  invalidateJobRoute: vi.fn(),
}));

vi.mock('../../src/lib/deliverySchema', () => ({
  ensureDeliveryJobsTables: vi.fn(async () => undefined),
}));

import { recordVehicleFailureAndReleaseJob } from '../../src/lib/deliveryJobHelpers';
import { prisma } from '../../src/lib/prisma';
import { lkrToDecimal } from '../helpers/moneyExpect';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.deliveryAttempt.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.deliveryAttempt.create).mockResolvedValue({} as never);
  vi.mocked(prisma.orderStatusEvent.create).mockResolvedValue({} as never);
  vi.mocked(prisma.deliveryJob.update).mockResolvedValue({} as never);
  vi.mocked(prisma.deliveryJob.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.deliveryJob.findFirst).mockResolvedValue(null as never);
});

describe('recordVehicleFailureAndReleaseJob fee freeze', () => {
  it('freezes totalDeliveryFees to only orders the original rider already delivered', async () => {
    vi.mocked(prisma.deliveryJobOrder.findMany)
      .mockResolvedValueOnce([
        {
          orderId: 'ord-2',
          sequence: 2,
          order: { id: 'ord-2', status: 'OUT_FOR_DELIVERY' },
        },
      ] as never)
      .mockResolvedValueOnce([
        { orderId: 'ord-1', order: { status: 'DELIVERED', deliveryFee: 200 } },
        { orderId: 'ord-2', order: { status: 'OUT_FOR_DELIVERY', deliveryFee: 300 } },
      ] as never);

    const result = await recordVehicleFailureAndReleaseJob({
      jobId: 'job-a',
      driverId: 'driver-a',
      storeId: 'store-1',
      fromSequence: 2,
      lat: 6.9,
      lng: 79.86,
    });

    expect(result.orderIds).toEqual(['ord-2']);
    expect(prisma.deliveryJob.update).toHaveBeenCalledWith({
      where: { id: 'job-a' },
      data: expect.objectContaining({
        status: 'VEHICLE_FAILURE',
        totalDeliveryFees: lkrToDecimal(200),
      }),
    });
  });
});
