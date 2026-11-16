import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryJob: { findMany: vi.fn() },
    deliveryAttempt: { findMany: vi.fn() },
    driverComplaint: { findMany: vi.fn() },
  },
}));

import { getMyJobHistory } from '../../src/controllers/deliveryJobController';
import { prisma } from '../../src/lib/prisma';

const DRIVER_ID = 'driver-1';
const CLOSED_AT = new Date('2026-03-10T14:30:00.000Z');
const ADMIN_REASON = 'Stuck — customer unreachable';

function req() {
  return createMockReq({ user: { sub: DRIVER_ID, storeId: 'store-1' } } as never);
}

function adminCancelledJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-cancel-1',
    title: 'Lunch run',
    status: 'CANCELLED',
    driverId: DRIVER_ID,
    scheduledAt: new Date('2026-03-10T10:00:00.000Z'),
    completedAt: CLOSED_AT,
    rideCode: 'RIDE-8842',
    totalDeliveryFees: null,
    store: { name: 'Nugegoda', city: 'Nugegoda' },
    adminCancellations: [{ reason: ADMIN_REASON, createdAt: CLOSED_AT }],
    jobOrders: [
      {
        orderId: 'order-1',
        order: { status: 'OUT_FOR_DELIVERY', total: 500, deliveryFee: 150, cancelledAtStatus: null },
      },
    ],
    ...overrides,
  };
}

describe('getMyJobHistory — admin-closed rides', () => {
  beforeEach(() => {
    vi.mocked(prisma.deliveryAttempt.findMany).mockResolvedValue([]);
    vi.mocked(prisma.driverComplaint.findMany).mockResolvedValue([]);
  });

  it('queries CANCELLED jobs only when an admin cancellation exists', async () => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue([]);

    const res = createMockRes();
    await getMyJobHistory(req(), res, createMockNext());

    const where = vi.mocked(prisma.deliveryJob.findMany).mock.calls[0]?.[0]?.where;
    expect(where?.driverId).toBe(DRIVER_ID);
    expect(where?.OR).toEqual(
      expect.arrayContaining([{ status: 'CANCELLED', adminCancellations: { some: {} } }]),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: [] }));
  });

  it('returns ADMIN_CLOSED display status and cancelReason for HQ-closed rides', async () => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue([adminCancelledJob() as never]);

    const res = createMockRes();
    await getMyJobHistory(req(), res, createMockNext());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          id: 'job-cancel-1',
          status: 'CANCELLED',
          displayStatus: 'ADMIN_CLOSED',
          cancelReason: ADMIN_REASON,
          completedAt: CLOSED_AT,
          rideCode: 'RIDE-8842',
        }),
      ],
    });
  });

  it('falls back completedAt to admin cancellation time when job completedAt is null', async () => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue([
      adminCancelledJob({ completedAt: null }) as never,
    ]);

    const res = createMockRes();
    await getMyJobHistory(req(), res, createMockNext());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [expect.objectContaining({ completedAt: CLOSED_AT })],
    });
  });
});
