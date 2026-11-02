import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryJob: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    deliveryEvent: { createMany: vi.fn(), findFirst: vi.fn() },
    deliveryAttempt: { findMany: vi.fn() },
    adminUser: { findFirst: vi.fn(), update: vi.fn() },
    driverComplaint: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../../src/lib/driverAccess', () => ({
  getDriverAccessibleStoreIds: vi.fn(async () => ['store-1']),
}));

vi.mock('../../src/lib/socket', () => ({
  broadcastJobClaimed: vi.fn(),
  broadcastNewJob: vi.fn(),
  broadcastDeliveryJobUpdated: vi.fn(),
  broadcastVehicleFailureReported: vi.fn(),
}));

vi.mock('../../src/lib/driverPush', () => ({
  sendPushToBranchDrivers: vi.fn(async () => ({ driversTargeted: 0, tokensSent: 0 })),
}));

vi.mock('../../src/lib/liveDriverTracking', () => ({
  jobHasPickedUp: vi.fn(async () => false),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { claimJob } from '../../src/controllers/deliveryJobController';
import { prisma } from '../../src/lib/prisma';
import { getDriverAccessibleStoreIds } from '../../src/lib/driverAccess';
import { broadcastJobClaimed, broadcastDeliveryJobUpdated } from '../../src/lib/socket';
import { AppError } from '../../src/middleware/errorHandler';

const DRIVER_ID = 'driver-1';

function req(jobId = 'job-1') {
  return createMockReq({
    params: { id: jobId },
    body: {},
    user: { sub: DRIVER_ID, storeId: 'store-1' },
  } as never);
}

/** A SCHEDULED, unclaimed job at the driver's branch. */
function scheduledJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    storeId: 'store-1',
    status: 'SCHEDULED',
    driverId: null,
    scheduledAt: new Date(),
    jobOrders: [{ orderId: 'order-1' }, { orderId: 'order-2' }],
    ...overrides,
  };
}

/** Shape formatJob needs after a successful claim. */
function claimedJobRow() {
  const order = {
    id: 'order-1',
    orderNumber: 'BC1',
    status: 'OUT_FOR_DELIVERY',
    guestName: 'Amal',
    guestPhone: '0771234567',
    deliveryAddressLine: '1 Main St',
    deliveryCity: 'Colombo',
    deliveryDistrict: 'Colombo',
    deliveryLat: 6.9,
    deliveryLng: 79.86,
    deliveryFee: 200,
    total: 1200,
    subtotal: 1000,
    items: [{ quantity: 2, product: { name: 'Milk Tea' } }],
    address: null,
    user: null,
  };
  return {
    id: 'job-1',
    rideCode: 'RIDE-1024',
    title: 'Evening run',
    status: 'ASSIGNED',
    storeId: 'store-1',
    driverId: DRIVER_ID,
    scheduledAt: new Date(),
    assignedAt: new Date('2026-09-02T10:05:00Z'),
    startedAt: null,
    completedAt: null,
    totalDistanceKm: null,
    totalCups: 2,
    totalDeliveryFees: 200,
    store: {
      id: 'store-1',
      name: 'Nugegoda',
      lat: 6.87,
      lng: 79.89,
      addressLine: 'High Level Rd',
      city: 'Nugegoda',
      deliveryOtpRequired: false,
      completionRadiusM: 100,
    },
    jobOrders: [
      { orderId: 'order-1', sequence: 1, order },
      {
        orderId: 'order-2',
        sequence: 2,
        order: { ...order, id: 'order-2', orderNumber: 'BC2' },
      },
    ],
  };
}

/** Drives the enum-probe `$queryRaw` in takeScheduledJob. */
function queuedEnum(present: boolean) {
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ cnt: present ? 1n : 0n }] as never);
}

function heldRuns(statuses: string[]) {
  vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue(
    statuses.map((status, i) => ({ id: `held-${i}`, status })) as never,
  );
}

function thrownError(next: ReturnType<typeof createMockNext>): AppError {
  return asMockFn(next).mock.calls[0][0] as AppError;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.deliveryJob.findUnique).mockReset();
  vi.mocked(getDriverAccessibleStoreIds).mockResolvedValue(['store-1'] as never);
  vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
    isActive: true,
    dutyStatus: 'ONLINE',
    name: 'Nimal',
  } as never);
  vi.mocked(prisma.adminUser.update).mockResolvedValue({} as never);
  vi.mocked(prisma.deliveryEvent.createMany).mockResolvedValue({ count: 2 } as never);
  vi.mocked(prisma.deliveryAttempt.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.driverComplaint.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.deliveryJob.updateMany).mockResolvedValue({ count: 1 } as never);
  heldRuns([]);
  queuedEnum(true);
});

describe('claimJob — branch scoping', () => {
  it('403s a driver who is not linked to any branch', async () => {
    vi.mocked(getDriverAccessibleStoreIds).mockResolvedValue([] as never);
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(403);
    expect(prisma.deliveryJob.updateMany).not.toHaveBeenCalled();
  });

  it('404s a job belonging to another branch', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      scheduledJob({ storeId: 'store-other' }) as never,
    );
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(404);
    expect(prisma.deliveryJob.updateMany).not.toHaveBeenCalled();
  });
});

describe('claimJob — driver eligibility', () => {
  it('403s a suspended driver', async () => {
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      isActive: false,
      dutyStatus: 'ONLINE',
      name: 'Nimal',
    } as never);
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(403);
  });

  it('400s a driver who is off duty', async () => {
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      isActive: true,
      dutyStatus: 'OFF_DUTY',
      name: 'Nimal',
    } as never);
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(400);
  });
});

describe('claimJob — the one-run-plus-one-queued cap', () => {
  beforeEach(() => {
    vi.mocked(prisma.deliveryJob.findUnique).mockReset();
    vi.mocked(prisma.deliveryJob.findUnique)
      .mockResolvedValueOnce(scheduledJob() as never)
      .mockResolvedValueOnce(claimedJobRow() as never);
  });

  it('assigns straight away when the driver holds nothing', async () => {
    heldRuns([]);
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.deliveryJob.updateMany).mock.calls[0][0]).toMatchObject({
      where: { id: 'job-1', status: 'SCHEDULED', OR: [{ driverId: null }, { driverId: DRIVER_ID }] },
      data: { driverId: DRIVER_ID, status: 'ASSIGNED' },
    });
    expect(broadcastDeliveryJobUpdated).toHaveBeenCalledWith('store-1', {
      jobId: 'job-1',
      status: 'ASSIGNED',
    });
  });

  it('assigns the claim while the rider is returning to the branch', async () => {
    // RETURNING is held but is not a "current run", so the next job starts immediately.
    heldRuns(['RETURNING']);
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.deliveryJob.updateMany).mock.calls[0][0]).toMatchObject({
      data: { status: 'ASSIGNED' },
    });
    expect(broadcastDeliveryJobUpdated).toHaveBeenCalledWith('store-1', {
      jobId: 'job-1',
      status: 'ASSIGNED',
    });
  });

  it('queues the claim on top of an in-progress or assigned run', async () => {
    heldRuns(['IN_PROGRESS']);
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.deliveryJob.updateMany).mock.calls[0][0]).toMatchObject({
      data: { status: 'QUEUED' },
    });
    expect(broadcastDeliveryJobUpdated).toHaveBeenCalledWith('store-1', {
      jobId: 'job-1',
      status: 'QUEUED',
    });
  });

  it('marks the driver ON_DELIVERY and tells the branch pool the job is gone', async () => {
    heldRuns([]);

    await claimJob(req(), createMockRes(), createMockNext());

    expect(prisma.adminUser.update).toHaveBeenCalledWith({
      where: { id: DRIVER_ID },
      data: { dutyStatus: 'ON_DELIVERY' },
    });
    expect(broadcastJobClaimed).toHaveBeenCalledWith('store-1', 'job-1', DRIVER_ID, 'Nimal');
    expect(broadcastDeliveryJobUpdated).toHaveBeenCalledWith('store-1', {
      jobId: 'job-1',
      status: 'ASSIGNED',
    });
  });

  it('writes an ASSIGNED delivery event per order', async () => {
    heldRuns([]);

    await claimJob(req(), createMockRes(), createMockNext());

    const { data } = vi.mocked(prisma.deliveryEvent.createMany).mock.calls[0][0] as {
      data: Array<{ orderId: string; state: string; note: string }>;
    };
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ state: 'ASSIGNED', note: 'Job assigned to driver' });
  });

  it('notes the queued case differently in the audit trail', async () => {
    heldRuns(['IN_PROGRESS']);

    await claimJob(req(), createMockRes(), createMockNext());

    const { data } = vi.mocked(prisma.deliveryEvent.createMany).mock.calls[0][0] as {
      data: Array<{ note: string }>;
    };
    expect(data[0].note).toBe('Job queued for driver');
  });
});

describe('claimJob — refusals', () => {
  it('409s a driver who already holds a run plus a queued job', async () => {
    heldRuns(['IN_PROGRESS', 'QUEUED']);
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(scheduledJob() as never);
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    const err = thrownError(next);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('ACTIVE_JOB');
    expect(prisma.deliveryJob.updateMany).not.toHaveBeenCalled();
  });

  it('409s a second claim when the live DB has no QUEUED enum value yet', async () => {
    heldRuns(['ASSIGNED']);
    queuedEnum(false);
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(scheduledJob() as never);
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    const err = thrownError(next);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('ACTIVE_JOB');
  });

  it('400s a job that is no longer SCHEDULED', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      scheduledJob({ status: 'IN_PROGRESS', driverId: 'someone-else' }) as never,
    );
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(400);
  });

  it('409s when another driver wins the race', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(scheduledJob() as never);
    vi.mocked(prisma.deliveryJob.updateMany).mockResolvedValue({ count: 0 } as never);
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    const err = thrownError(next);
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/already claimed/i);
    expect(prisma.deliveryEvent.createMany).not.toHaveBeenCalled();
  });

  it('400s a SCHEDULED job pre-targeted at a different driver', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      scheduledJob({ driverId: 'someone-else' }) as never,
    );
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    const err = thrownError(next);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/already assigned/i);
    expect(prisma.deliveryJob.updateMany).not.toHaveBeenCalled();
  });
});

describe('claimJob — a job pre-targeted at this driver (failure redelivery)', () => {
  it('lets the driver claim it even though it was scheduled on an earlier day', async () => {
    vi.mocked(prisma.deliveryJob.findUnique)
      .mockResolvedValueOnce(
        scheduledJob({ driverId: DRIVER_ID, scheduledAt: new Date('2020-01-01T00:00:00Z') }) as never,
      )
      .mockResolvedValueOnce(claimedJobRow() as never);
    heldRuns([]);
    const next = createMockNext();

    await claimJob(req(), createMockRes(), next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.deliveryJob.updateMany).mock.calls[0][0]).toMatchObject({
      where: { id: 'job-1', status: 'SCHEDULED', OR: [{ driverId: null }, { driverId: DRIVER_ID }] },
      data: { driverId: DRIVER_ID, status: 'ASSIGNED' },
    });
  });
});
