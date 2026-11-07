import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryJob: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('../../src/lib/socket', () => ({
  broadcastNewJob: vi.fn(),
  broadcastJobClaimed: vi.fn(),
  broadcastDeliveryJobUpdated: vi.fn(),
  broadcastVehicleFailureReported: vi.fn(),
}));

vi.mock('../../src/lib/driverPush', () => ({
  sendPushToBranchDrivers: vi.fn(async () => ({ driversTargeted: 2, tokensSent: 2 })),
}));

vi.mock('../../src/lib/liveDriverTracking', () => ({
  jobHasPickedUp: vi.fn(async () => false),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { reRingDeliveryJob } from '../../src/controllers/deliveryJobController';
import { dateStringInColombo } from '../../src/lib/datetime';
import { prisma } from '../../src/lib/prisma';
import { broadcastDeliveryJobUpdated, broadcastNewJob } from '../../src/lib/socket';
import { sendPushToBranchDrivers } from '../../src/lib/driverPush';
import { AppError } from '../../src/middleware/errorHandler';

function req() {
  return createMockReq({ params: { id: 'job-1' }, body: {} } as never);
}

function unclaimedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    rideCode: 'RIDE-1024',
    title: 'Evening run',
    status: 'SCHEDULED',
    driverId: null,
    storeId: 'store-1',
    scheduledAt: new Date('2026-09-02T10:00:00Z'),
    totalCups: null,
    totalDeliveryFees: null,
    estimatedDistanceKm: null,
    estimatedMinutes: null,
    totalDistanceKm: null,
    store: { id: 'store-1', name: 'Nugegoda' },
    jobOrders: [
      { orderId: 'order-1', order: { deliveryFee: 150, items: [{ quantity: 2 }] } },
      { orderId: 'order-2', order: { deliveryFee: 200, items: [{ quantity: 3 }] } },
    ],
    ...overrides,
  };
}

function thrownError(next: ReturnType<typeof createMockNext>): AppError {
  return asMockFn(next).mock.calls[0][0] as AppError;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.deliveryJob.update).mockResolvedValue({} as never);
});

/**
 * Branch-side "Re-ring" for a job still sitting unclaimed. It must reach the phone even
 * when the app already knows about the job and is mid quiet-gap in its own ring cycle.
 */
describe('reRingDeliveryJob', () => {
  it('404s an unknown job', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(null as never);
    const next = createMockNext();

    await reRingDeliveryJob(req(), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(404);
    expect(broadcastNewJob).not.toHaveBeenCalled();
  });

  it('409s a job another driver already claimed', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      unclaimedJob({ status: 'ASSIGNED', driverId: 'driver-2' }) as never,
    );
    const next = createMockNext();

    await reRingDeliveryJob(req(), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(409);
    expect(sendPushToBranchDrivers).not.toHaveBeenCalled();
  });

  it('409s a job that is SCHEDULED but already has a driver attached', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      unclaimedJob({ driverId: 'driver-2' }) as never,
    );
    const next = createMockNext();

    await reRingDeliveryJob(req(), createMockRes(), next);

    expect(thrownError(next).statusCode).toBe(409);
  });

  it('re-broadcasts to the branch pool with a fresh broadcastedAt', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(unclaimedJob() as never);

    await reRingDeliveryJob(req(), createMockRes(), createMockNext());

    expect(broadcastNewJob).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({
        id: 'job-1',
        status: 'SCHEDULED',
        storeId: 'store-1',
        broadcastedAt: expect.any(Date),
        forceRing: true,
      }),
    );
  });

  it('pushes with forceRing so the phone rings immediately', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(unclaimedJob() as never);

    await reRingDeliveryJob(req(), createMockRes(), createMockNext());

    expect(sendPushToBranchDrivers).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({ jobId: 'job-1', forceRing: true, storeId: 'store-1' }),
    );
  });

  it('derives cups and fees from the orders when not denormalised', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(unclaimedJob() as never);

    await reRingDeliveryJob(req(), createMockRes(), createMockNext());

    expect(vi.mocked(sendPushToBranchDrivers).mock.calls[0][1]).toMatchObject({
      totalCups: 5,
      deliveryFee: 350,
    });
  });

  it('prefers the stored totals when they exist', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      unclaimedJob({ totalCups: 12, totalDeliveryFees: 90_000 }) as never,
    );

    await reRingDeliveryJob(req(), createMockRes(), createMockNext());

    expect(vi.mocked(sendPushToBranchDrivers).mock.calls[0][1]).toMatchObject({
      totalCups: 12,
      deliveryFee: 900,
    });
  });

  it('confirms the re-ring to the admin caller', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(unclaimedJob() as never);
    const res = createMockRes();

    await reRingDeliveryJob(req(), res, createMockNext());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { reRung: true, jobId: 'job-1' },
    });
  });

  it('reschedules a missed past-day job to today before re-broadcasting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T12:00:00+05:30'));
    const past = new Date('2026-11-05T10:00:00+05:30');
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(unclaimedJob({ scheduledAt: past }) as never);

    await reRingDeliveryJob(req(), createMockRes(), createMockNext());

    expect(prisma.deliveryJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { scheduledAt: expect.any(Date) },
    });
    expect(broadcastDeliveryJobUpdated).toHaveBeenCalledWith('store-1', {
      jobId: 'job-1',
      status: 'SCHEDULED',
    });
    const offer = vi.mocked(broadcastNewJob).mock.calls[0]?.[1] as { scheduledAt: Date };
    expect(dateStringInColombo(offer.scheduledAt)).toBe('2026-11-07');
    vi.useRealTimers();
  });

  it('does not reschedule same-day unclaimed jobs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T12:00:00+05:30'));
    const sameDay = new Date('2026-11-07T08:00:00+05:30');
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(unclaimedJob({ scheduledAt: sameDay }) as never);

    await reRingDeliveryJob(req(), createMockRes(), createMockNext());

    expect(prisma.deliveryJob.update).not.toHaveBeenCalled();
    expect(broadcastDeliveryJobUpdated).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
