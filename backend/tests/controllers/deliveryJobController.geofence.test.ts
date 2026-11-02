import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryJob: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    deliveryEvent: { createMany: vi.fn(), findFirst: vi.fn() },
    deliveryAttempt: { findMany: vi.fn() },
    driverComplaint: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/driverAccess', () => ({
  getDriverAccessibleStoreIds: vi.fn(async () => ['store-1']),
}));

vi.mock('../../src/lib/socket', () => ({
  broadcastDeliveryJobUpdated: vi.fn(),
  broadcastJobClaimed: vi.fn(),
  broadcastNewJob: vi.fn(),
  broadcastVehicleFailureReported: vi.fn(),
}));

vi.mock('../../src/lib/liveDriverTracking', () => ({
  jobHasPickedUp: vi.fn(async () => false),
}));

// Keep the real haversine so the distance assertions are meaningful; stub only the
// app-setting lookup behind the radius.
vi.mock('../../src/lib/deliveryJobHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/deliveryJobHelpers')>();
  return {
    ...actual,
    resolveCompletionRadiusM: vi.fn(async (storeRadius?: number | null) => storeRadius ?? 100),
    finalizeDeliveryJob: vi.fn(async () => undefined),
    promoteNextQueuedJob: vi.fn(async () => undefined),
    releaseDriverWhenIdle: vi.fn(async () => undefined),
  };
});

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { pickupJob, completeJob } from '../../src/controllers/deliveryJobController';
import { prisma } from '../../src/lib/prisma';
import { jobHasPickedUp } from '../../src/lib/liveDriverTracking';
import { broadcastDeliveryJobUpdated } from '../../src/lib/socket';
import {
  finalizeDeliveryJob,
  promoteNextQueuedJob,
  releaseDriverWhenIdle,
  resolveCompletionRadiusM,
} from '../../src/lib/deliveryJobHelpers';
import { AppError } from '../../src/middleware/errorHandler';

const DRIVER_ID = 'driver-1';
const BRANCH = { lat: 6.87, lng: 79.89 };
/** ~50m north of the branch (1 deg lat ≈ 111km). */
const AT_BRANCH = { lat: BRANCH.lat + 0.00045, lng: BRANCH.lng };
/** ~1.1km north — well outside any sane branch radius. */
const FAR_AWAY = { lat: BRANCH.lat + 0.01, lng: BRANCH.lng };

function req(body: Record<string, unknown>) {
  return createMockReq({
    params: { id: 'job-1' },
    body,
    user: { sub: DRIVER_ID, storeId: 'store-1' },
  } as never);
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    rideCode: 'RIDE-1024',
    title: 'Evening run',
    status: 'ASSIGNED',
    storeId: 'store-1',
    driverId: DRIVER_ID,
    scheduledAt: new Date('2026-09-02T10:00:00Z'),
    assignedAt: new Date('2026-09-02T10:05:00Z'),
    startedAt: null,
    completedAt: null,
    totalDistanceKm: null,
    store: {
      id: 'store-1',
      name: 'Nugegoda',
      ...BRANCH,
      addressLine: 'High Level Rd',
      city: 'Nugegoda',
      deliveryOtpRequired: false,
      completionRadiusM: 100,
    },
    jobOrders: [
      {
        orderId: 'order-1',
        sequence: 1,
        order: {
          id: 'order-1',
          orderNumber: 'BC-1',
          status: 'READY',
          deliveryFee: 150,
          items: [{ quantity: 2, productName: 'Tea', totalPrice: 500 }],
          user: null,
          address: null,
        },
      },
    ],
    ...overrides,
  };
}

function thrownError(next: ReturnType<typeof createMockNext>): AppError {
  return asMockFn(next).mock.calls[0][0] as AppError;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveCompletionRadiusM).mockImplementation(
    (async (storeRadius?: number | null) => storeRadius ?? 100) as never,
  );
  vi.mocked(prisma.deliveryEvent.createMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.deliveryAttempt.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.driverComplaint.findMany).mockResolvedValue([] as never);
  // formatJob asks canDriverClaimMore whether the rider can stack another job.
  vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue([] as never);
  vi.mocked(jobHasPickedUp).mockResolvedValue(false as never);
});

/** A driver must physically be at the outlet to say they collected the orders. */
describe('pickupJob — branch geofence', () => {
  beforeEach(() => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(job() as never);
  });

  it('rejects a pickup with no coordinates', async () => {
    const next = createMockNext();

    await pickupJob(req({}), createMockRes(), next);

    expect(asMockFn(next)).toHaveBeenCalled();
    expect(prisma.deliveryEvent.createMany).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range latitude', async () => {
    const next = createMockNext();

    await pickupJob(req({ lat: 200, lng: 79.89 }), createMockRes(), next);

    expect(asMockFn(next)).toHaveBeenCalled();
    expect(prisma.deliveryEvent.createMany).not.toHaveBeenCalled();
  });

  it('refuses a pickup from outside the branch radius and records nothing', async () => {
    const next = createMockNext();

    await pickupJob(req(FAR_AWAY), createMockRes(), next);

    const err = thrownError(next);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('OUTSIDE_BRANCH_RADIUS');
    expect(err.data).toMatchObject({ radiusM: 100, distanceM: expect.any(Number) });
    expect(err.data.distanceM).toBeGreaterThan(100);
    expect(prisma.deliveryEvent.createMany).not.toHaveBeenCalled();
  });

  it('allows a pickup at the branch and writes PICKED_UP per order', async () => {
    const next = createMockNext();

    await pickupJob(req(AT_BRANCH), createMockRes(), next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    const { data } = vi.mocked(prisma.deliveryEvent.createMany).mock.calls[0][0] as {
      data: Array<{ orderId: string; state: string }>;
    };
    expect(data).toEqual([expect.objectContaining({ orderId: 'order-1', state: 'PICKED_UP' })]);
  });

  it('honours a tighter per-branch radius over the default', async () => {
    vi.mocked(resolveCompletionRadiusM).mockResolvedValue(20 as never);
    const next = createMockNext();

    // ~50m out: inside the 100m default, outside a 20m branch override.
    await pickupJob(req(AT_BRANCH), createMockRes(), next);

    expect(thrownError(next).code).toBe('OUTSIDE_BRANCH_RADIUS');
  });

  it('is idempotent once the run is already picked up', async () => {
    vi.mocked(jobHasPickedUp).mockResolvedValue(true as never);

    await pickupJob(req(AT_BRANCH), createMockRes(), createMockNext());

    expect(prisma.deliveryEvent.createMany).not.toHaveBeenCalled();
  });

  it('skips orders that are already delivered or cancelled', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      job({
        jobOrders: [
          ...job().jobOrders,
          {
            orderId: 'order-2',
            sequence: 2,
            order: {
              id: 'order-2',
              orderNumber: 'BC-2',
              status: 'CANCELLED',
              deliveryFee: 0,
              items: [],
              user: null,
              address: null,
            },
          },
        ],
      }) as never,
    );

    await pickupJob(req(AT_BRANCH), createMockRes(), createMockNext());

    const { data } = vi.mocked(prisma.deliveryEvent.createMany).mock.calls[0][0] as {
      data: Array<{ orderId: string }>;
    };
    expect(data.map((d) => d.orderId)).toEqual(['order-1']);
  });

  it('allows a pickup far from the branch when the job has a pickup override', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      job({ pickupLat: FAR_AWAY.lat, pickupLng: FAR_AWAY.lng, pickupLabel: 'Rider breakdown location' }) as never,
    );
    const next = createMockNext();

    await pickupJob(req(FAR_AWAY), createMockRes(), next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    const { data } = vi.mocked(prisma.deliveryEvent.createMany).mock.calls[0][0] as {
      data: Array<{ orderId: string; state: string }>;
    };
    expect(data).toEqual([expect.objectContaining({ orderId: 'order-1', state: 'PICKED_UP' })]);
  });

  it('404s a job at another branch before looking at coordinates', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      job({ storeId: 'store-other' }) as never,
    );
    const next = createMockNext();

    await pickupJob(req(AT_BRANCH), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(404);
  });

  it('400s a job that has not been claimed yet', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      job({ status: 'SCHEDULED', driverId: null }) as never,
    );
    const next = createMockNext();

    await pickupJob(req(AT_BRANCH), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(400);
  });
});

/** The ride only ends once the rider is back at the branch. */
describe('completeJob — returning phase and branch geofence', () => {
  const returningJob = (overrides: Record<string, unknown> = {}) =>
    job({
      status: 'RETURNING',
      jobOrders: [
        {
          orderId: 'order-1',
          sequence: 1,
          order: {
            id: 'order-1',
            orderNumber: 'BC-1',
            status: 'DELIVERED',
            deliveryFee: 150,
            items: [{ quantity: 2, productName: 'Tea', totalPrice: 500 }],
            user: null,
            address: null,
          },
        },
      ],
      ...overrides,
    });

  it('sends the rider back to the branch while still delivering', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      returningJob({ status: 'IN_PROGRESS' }) as never,
    );
    const next = createMockNext();

    await completeJob(req(AT_BRANCH), createMockRes(), next);

    const err = thrownError(next);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/return to the branch/i);
  });

  it('refuses a run that has not reached the returning phase', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      returningJob({ status: 'ASSIGNED' }) as never,
    );
    const next = createMockNext();

    await completeJob(req(AT_BRANCH), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(400);
    expect(prisma.deliveryJob.update).not.toHaveBeenCalled();
  });

  it('refuses while a stop is still pending', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      returningJob({
        jobOrders: [
          {
            orderId: 'order-1',
            sequence: 1,
            order: {
              id: 'order-1',
              orderNumber: 'BC-1',
              status: 'OUT_FOR_DELIVERY',
              deliveryFee: 150,
              items: [],
              user: null,
              address: null,
            },
          },
        ],
      }) as never,
    );
    const next = createMockNext();

    await completeJob(req(AT_BRANCH), createMockRes(), next);

    expect(thrownError(next).message).toMatch(/still pending delivery/i);
  });

  it('counts a failed attempt as resolved so the run can be closed', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      returningJob({
        jobOrders: [
          {
            orderId: 'order-1',
            sequence: 1,
            order: {
              id: 'order-1',
              orderNumber: 'BC-1',
              status: 'OUT_FOR_DELIVERY',
              deliveryFee: 150,
              items: [],
              user: null,
              address: null,
            },
          },
        ],
      }) as never,
    );
    vi.mocked(prisma.deliveryAttempt.findMany).mockResolvedValue([
      { orderId: 'order-1' },
    ] as never);
    vi.mocked(prisma.deliveryJob.update).mockResolvedValue(returningJob() as never);
    const next = createMockNext();

    await completeJob(req(AT_BRANCH), createMockRes(), next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
  });

  it('refuses completion from outside the branch radius', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(returningJob() as never);
    const next = createMockNext();

    await completeJob(req(FAR_AWAY), createMockRes(), next);

    const err = thrownError(next);
    expect(err.code).toBe('OUTSIDE_BRANCH_RADIUS');
    expect(err.data.distanceM).toBeGreaterThan(100);
    expect(prisma.deliveryJob.update).not.toHaveBeenCalled();
  });

  it('completes at the branch and stamps where it happened', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(returningJob() as never);
    vi.mocked(prisma.deliveryJob.update).mockResolvedValue(
      returningJob({ status: 'COMPLETED' }) as never,
    );
    const next = createMockNext();

    await completeJob(req(AT_BRANCH), createMockRes(), next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.deliveryJob.update).mock.calls[0][0]).toMatchObject({
      where: { id: 'job-1' },
      data: {
        status: 'COMPLETED',
        completedAt: expect.any(Date),
        completedLat: AT_BRANCH.lat,
        completedLng: AT_BRANCH.lng,
      },
    });
  });

  it('finalises the ride, promotes the queued job and frees the rider', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(returningJob() as never);
    vi.mocked(prisma.deliveryJob.update).mockResolvedValue(
      returningJob({ status: 'COMPLETED' }) as never,
    );

    await completeJob(req(AT_BRANCH), createMockRes(), createMockNext());

    expect(finalizeDeliveryJob).toHaveBeenCalledWith('job-1');
    expect(promoteNextQueuedJob).toHaveBeenCalledWith(DRIVER_ID);
    expect(releaseDriverWhenIdle).toHaveBeenCalledWith(DRIVER_ID);
    expect(broadcastDeliveryJobUpdated).toHaveBeenCalledWith('store-1', {
      jobId: 'job-1',
      status: 'COMPLETED',
    });
  });

  it('requires coordinates', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(returningJob() as never);
    const next = createMockNext();

    await completeJob(req({}), createMockRes(), next);

    expect(asMockFn(next)).toHaveBeenCalled();
    expect(prisma.deliveryJob.update).not.toHaveBeenCalled();
  });
});
