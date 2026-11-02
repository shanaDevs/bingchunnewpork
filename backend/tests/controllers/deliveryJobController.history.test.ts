import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryJob: { findMany: vi.fn() },
    deliveryAttempt: { findMany: vi.fn() },
    driverComplaint: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/driverAccess', () => ({
  getDriverAccessibleStoreIds: vi.fn(async () => ['store-1']),
}));

vi.mock('../../src/lib/socket', () => ({
  broadcastNewJob: vi.fn(),
  broadcastJobClaimed: vi.fn(),
  broadcastDeliveryJobUpdated: vi.fn(),
  broadcastVehicleFailureReported: vi.fn(),
}));

vi.mock('../../src/lib/liveDriverTracking', () => ({
  jobHasPickedUp: vi.fn(async () => false),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getMyJobHistory } from '../../src/controllers/deliveryJobController';
import { prisma } from '../../src/lib/prisma';

const DRIVER_A = 'driver-a';

function req() {
  return createMockReq({
    query: { limit: '50' },
    user: { sub: DRIVER_A, storeId: 'store-1' },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.driverComplaint.findMany).mockResolvedValue([] as never);
});

describe('getMyJobHistory vehicle-failure earnings', () => {
  it('credits rider A only for the stop they delivered after rider B finishes leftover orders', async () => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue([
      {
        id: 'job-a',
        title: 'Lunch run',
        status: 'VEHICLE_FAILURE',
        rideCode: 'RIDE-1024',
        scheduledAt: new Date('2026-09-10T08:00:00Z'),
        completedAt: new Date('2026-09-10T08:40:00Z'),
        totalDeliveryFees: 20_000,
        store: { name: 'Nugegoda', city: 'Nugegoda' },
        jobOrders: [
          { orderId: 'ord-1', order: { status: 'DELIVERED', total: 1200, deliveryFee: 200 } },
          // Leftover failed stop — still linked, now DELIVERED by rider B
          { orderId: 'ord-2', order: { status: 'DELIVERED', total: 900, deliveryFee: 300 } },
        ],
      },
    ] as never);
    vi.mocked(prisma.deliveryAttempt.findMany).mockResolvedValue([
      { jobId: 'job-a', orderId: 'ord-2' },
    ] as never);

    const res = createMockRes();
    const next = createMockNext();
    await getMyJobHistory(req(), res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          id: 'job-a',
          status: 'VEHICLE_FAILURE',
          orderCount: 2,
          deliveredCount: 1,
          deliveredTotal: 200,
          totalDeliveryFees: '200',
          rideCode: 'RIDE-1024',
        }),
      ],
    });
  });

  it('credits rider B for leftover orders on the redelivery job', async () => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue([
      {
        id: 'job-b',
        title: 'Redelivery #1042',
        status: 'COMPLETED',
        scheduledAt: new Date('2026-09-10T09:00:00Z'),
        completedAt: new Date('2026-09-10T09:30:00Z'),
        totalDeliveryFees: 30_000,
        store: { name: 'Nugegoda', city: 'Nugegoda' },
        jobOrders: [{ orderId: 'ord-2', order: { status: 'DELIVERED', total: 900, deliveryFee: 300 } }],
      },
    ] as never);
    vi.mocked(prisma.deliveryAttempt.findMany).mockResolvedValue([] as never);

    const res = createMockRes();
    await getMyJobHistory(req(), res, createMockNext());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          id: 'job-b',
          orderCount: 1,
          deliveredCount: 1,
          deliveredTotal: 300,
        }),
      ],
    });
  });
});
