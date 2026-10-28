import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryJob: { findUnique: vi.fn(), updateMany: vi.fn() },
    deliveryJobRejection: { create: vi.fn() },
    deliveryEvent: { findMany: vi.fn(), createMany: vi.fn() },
    deliveryAttempt: { findMany: vi.fn() },
    driverComplaint: { findMany: vi.fn() },
    $transaction: vi.fn(),
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

vi.mock('../../src/lib/driverPush', () => ({
  sendPushToBranchDrivers: vi.fn(async () => ({ driversTargeted: 1, tokensSent: 1 })),
}));

vi.mock('../../src/lib/meritPoints', () => ({
  applyMeritDelta: vi.fn(async () => undefined),
  recordSuccessfulDelivery: vi.fn(async () => undefined),
  MERIT_DELTAS: { CANCEL_BEFORE_PICKUP: -5 },
}));

vi.mock('../../src/lib/liveDriverTracking', () => ({
  jobHasPickedUp: vi.fn(async () => false),
}));

vi.mock('../../src/lib/deliveryJobHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/deliveryJobHelpers')>();
  return { ...actual, releaseDriverWhenIdle: vi.fn(async () => undefined) };
});

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { rejectJob } from '../../src/controllers/deliveryJobController';
import { prisma } from '../../src/lib/prisma';
import { broadcastNewJob, broadcastDeliveryJobUpdated } from '../../src/lib/socket';
import { sendPushToBranchDrivers } from '../../src/lib/driverPush';
import { applyMeritDelta } from '../../src/lib/meritPoints';
import { releaseDriverWhenIdle } from '../../src/lib/deliveryJobHelpers';
import { AppError } from '../../src/middleware/errorHandler';

const DRIVER_ID = 'driver-1';
const REASON = 'Bike puncture on the way to the branch';

function req(body: Record<string, unknown> = { reason: REASON }) {
  return createMockReq({
    params: { id: 'job-1' },
    body,
    user: { sub: DRIVER_ID, storeId: 'store-1' },
  } as never);
}

function assignedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    rideCode: 'RIDE-1024',
    title: 'Evening run',
    status: 'ASSIGNED',
    storeId: 'store-1',
    driverId: DRIVER_ID,
    scheduledAt: new Date(),
    totalCups: null,
    totalDeliveryFees: null,
    estimatedDistanceKm: null,
    estimatedMinutes: null,
    totalDistanceKm: null,
    store: { id: 'store-1', name: 'Nugegoda', lat: 6.87, lng: 79.89, completionRadiusM: 100 },
    jobOrders: [
      { orderId: 'order-1', order: { deliveryFee: 150, items: [{ quantity: 2 }] } },
      { orderId: 'order-2', order: { deliveryFee: 200, items: [{ quantity: 3 }] } },
    ],
    ...overrides,
  };
}

/** Captures the writes the handler makes inside its transaction. */
function runTransaction() {
  const tx = {
    deliveryJob: { updateMany: vi.fn(async () => ({ count: 1 })) },
    deliveryJobRejection: { create: vi.fn(async () => ({})) },
    deliveryEvent: { createMany: vi.fn(async () => ({ count: 2 })) },
  };
  vi.mocked(prisma.$transaction).mockImplementation(
    (async (fn: (t: typeof tx) => unknown) => fn(tx)) as never,
  );
  return tx;
}

function thrownError(next: ReturnType<typeof createMockNext>): AppError {
  return asMockFn(next).mock.calls[0][0] as AppError;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(assignedJob() as never);
  vi.mocked(prisma.deliveryEvent.findMany).mockResolvedValue([
    { state: 'ASSIGNED' },
  ] as never);
  vi.mocked(prisma.deliveryAttempt.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.driverComplaint.findMany).mockResolvedValue([] as never);
});

describe('rejectJob — guards', () => {
  it('refuses a job that is not ASSIGNED or QUEUED', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      assignedJob({ status: 'IN_PROGRESS' }) as never,
    );
    runTransaction();
    const next = createMockNext();

    await rejectJob(req(), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses once anything on the run has been picked up', async () => {
    vi.mocked(prisma.deliveryEvent.findMany).mockResolvedValue([
      { state: 'ASSIGNED' },
      { state: 'PICKED_UP' },
    ] as never);
    runTransaction();
    const next = createMockNext();

    await rejectJob(req(), createMockRes(), next);

    const err = thrownError(next);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/after pickup/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses another driver's job", async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      assignedJob({ driverId: 'driver-2' }) as never,
    );
    const next = createMockNext();

    await rejectJob(req(), createMockRes(), next);

    // getDriverJobOrThrow rejects a job held by someone else before the ownership check.
    expect(thrownError(next).statusCode).toBe(403);
  });

  it('requires a reason of at least a few characters', async () => {
    const next = createMockNext();

    await rejectJob(req({ reason: 'x' }), createMockRes(), next);

    expect(asMockFn(next)).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('rejectJob — re-pooling', () => {
  it('returns the job to the pool as a fresh offer', async () => {
    const tx = runTransaction();

    await rejectJob(req(), createMockRes(), createMockNext());

    expect(tx.deliveryJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', driverId: DRIVER_ID, status: { in: ['ASSIGNED', 'QUEUED'] } },
      data: {
        driverId: null,
        status: 'SCHEDULED',
        assignedAt: null,
        broadcastedAt: expect.any(Date),
      },
    });
  });

  it('records the rejection so the branch keeps an audit trail', async () => {
    const tx = runTransaction();

    await rejectJob(req(), createMockRes(), createMockNext());

    expect(tx.deliveryJobRejection.create).toHaveBeenCalledWith({
      data: {
        id: expect.any(String),
        jobId: 'job-1',
        driverId: DRIVER_ID,
        reason: REASON,
      },
    });
  });

  it('logs a PENDING_ASSIGNMENT event per order with the reason', async () => {
    const tx = runTransaction();

    await rejectJob(req(), createMockRes(), createMockNext());

    const { data } = tx.deliveryEvent.createMany.mock.calls[0][0] as {
      data: Array<{ orderId: string; state: string; note: string }>;
    };
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      orderId: 'order-1',
      state: 'PENDING_ASSIGNMENT',
      note: `Rejected by driver: ${REASON}`,
    });
  });

  it('docks merit points for cancelling before pickup', async () => {
    runTransaction();

    await rejectJob(req(), createMockRes(), createMockNext());

    expect(applyMeritDelta).toHaveBeenCalledWith(
      expect.objectContaining({
        driverId: DRIVER_ID,
        delta: -5,
        eventType: 'CANCEL_BEFORE_PICKUP',
      }),
    );
  });

  it('surfaces a 409 when the job slipped out from under the reject', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(
      (async (fn: (t: unknown) => unknown) =>
        fn({
          deliveryJob: { updateMany: vi.fn(async () => ({ count: 0 })) },
          deliveryJobRejection: { create: vi.fn() },
          deliveryEvent: { createMany: vi.fn() },
        })) as never,
    );
    const next = createMockNext();

    await rejectJob(req(), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(409);
    expect(broadcastNewJob).not.toHaveBeenCalled();
    expect(broadcastDeliveryJobUpdated).not.toHaveBeenCalled();
  });
});

describe('rejectJob — re-broadcast', () => {
  it('re-offers the job to the whole branch pool with a fresh broadcastedAt', async () => {
    runTransaction();

    await rejectJob(req(), createMockRes(), createMockNext());

    expect(broadcastNewJob).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({
        id: 'job-1',
        status: 'SCHEDULED',
        storeId: 'store-1',
        broadcastedAt: expect.any(Date),
      }),
    );
    expect(vi.mocked(broadcastNewJob).mock.calls[0][1]).not.toHaveProperty('forceRing');
    expect(broadcastDeliveryJobUpdated).toHaveBeenCalledWith('store-1', {
      jobId: 'job-1',
      status: 'SCHEDULED',
    });
  });

  it('falls back to summing the orders for cups and fees', async () => {
    runTransaction();

    await rejectJob(req(), createMockRes(), createMockNext());

    expect(vi.mocked(sendPushToBranchDrivers).mock.calls[0][1]).toMatchObject({
      jobId: 'job-1',
      totalCups: 5,
      deliveryFee: 350,
      storeId: 'store-1',
    });
    expect(vi.mocked(sendPushToBranchDrivers).mock.calls[0][1]).not.toHaveProperty('forceRing');
  });

  it('frees the rider BEFORE pushing, so the rejector is back in the audience', async () => {
    // The push audience is "eligible drivers at this branch"; if the rejector were still
    // ON_DELIVERY when the push went out they would be filtered out of their own re-offer.
    runTransaction();

    await rejectJob(req(), createMockRes(), createMockNext());

    const released = vi.mocked(releaseDriverWhenIdle).mock.invocationCallOrder[0];
    const pushed = vi.mocked(sendPushToBranchDrivers).mock.invocationCallOrder[0];
    expect(released).toBeLessThan(pushed);
  });

  it('answers the driver with the rejection result', async () => {
    runTransaction();
    const res = createMockRes();

    await rejectJob(req(), res, createMockNext());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { rejected: true, jobId: 'job-1' },
    });
  });
});
