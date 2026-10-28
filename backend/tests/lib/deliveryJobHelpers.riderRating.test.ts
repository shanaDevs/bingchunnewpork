import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryJobOrder: { findFirst: vi.fn() },
    deliveryJob: { update: vi.fn() },
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

import { incrementJobRiderRating } from '../../src/lib/deliveryJobHelpers';
import { prisma } from '../../src/lib/prisma';

describe('incrementJobRiderRating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.deliveryJob.update).mockResolvedValue({} as never);
  });

  it('increments aggregates on a RETURNING job with an assigned rider', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue({ jobId: 'job-1' } as never);

    await incrementJobRiderRating('order-1', 5);

    expect(prisma.deliveryJobOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orderId: 'order-1',
          job: {
            driverId: { not: null },
            status: { in: ['IN_PROGRESS', 'RETURNING', 'COMPLETED'] },
          },
        },
      }),
    );
    expect(prisma.deliveryJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        riderRatingSum: { increment: 5 },
        riderRatingCount: { increment: 1 },
      },
    });
  });

  it('no-ops when no assigned job is found', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(null);

    await incrementJobRiderRating('order-1', 4);

    expect(prisma.deliveryJob.update).not.toHaveBeenCalled();
  });
});
