import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@bingchun/db', () => ({
  prisma: {
    deliveryJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    driverLocation: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from '@bingchun/db';
import { finalizeDeliveryJob } from '../src/gpsPath';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('finalizeDeliveryJob totalDeliveryFees', () => {
  it('persists credited fees as integer cents (150 LKR → 15000)', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue({
      id: 'job-1',
      totalDistanceKm: 5,
      store: { lat: 6.9, lng: 79.86 },
      jobOrders: [
        {
          sequence: 1,
          order: {
            status: 'DELIVERED',
            deliveryFee: 150,
            cancelledAtStatus: null,
            deliveryLat: null,
            deliveryLng: null,
            address: null,
          },
        },
      ],
    } as never);

    await finalizeDeliveryJob('job-1');

    expect(prisma.deliveryJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          totalDeliveryFees: expect.objectContaining({ toFixed: expect.any(Function) }),
        }),
      }),
    );
    const call = vi.mocked(prisma.deliveryJob.update).mock.calls[0]![0] as {
      data: { totalDeliveryFees: { toFixed: (d: number) => string } };
    };
    expect(call.data.totalDeliveryFees.toFixed(0)).toBe('15000');
  });
});
