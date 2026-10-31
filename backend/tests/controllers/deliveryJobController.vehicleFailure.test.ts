import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryJobOrder: { findFirst: vi.fn() },
    deliveryJob: { findFirst: vi.fn() },
    $disconnect: vi.fn(async () => undefined),
    $connect: vi.fn(async () => undefined),
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

vi.mock('../../src/lib/deliveryJobHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/deliveryJobHelpers')>();
  return {
    ...actual,
    recordVehicleFailureAndReleaseJob: vi.fn(async () => ({ orderIds: ['order-1'] })),
    persistJobActualRouteFromGps: vi.fn(async () => undefined),
  };
});

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { reportVehicleFailure } from '../../src/controllers/deliveryJobController';
import { prisma } from '../../src/lib/prisma';
import { jobHasPickedUp } from '../../src/lib/liveDriverTracking';
import { recordVehicleFailureAndReleaseJob, REJECT_JOB_BEFORE_FAILURE_MESSAGE, persistJobActualRouteFromGps } from '../../src/lib/deliveryJobHelpers';
import { broadcastVehicleFailureReported } from '../../src/lib/socket';
import { AppError } from '../../src/middleware/errorHandler';

const DRIVER_ID = 'driver-1';

function req(body: Record<string, unknown> = { lat: 6.87, lng: 79.89 }) {
  return createMockReq({
    body,
    user: { sub: DRIVER_ID, storeId: 'store-1' },
  } as never);
}

function thrownError(next: ReturnType<typeof createMockNext>): AppError {
  return asMockFn(next).mock.calls[0][0] as AppError;
}

function inProgressLink() {
  return {
    sequence: 1,
    orderId: 'order-1',
    job: { id: 'job-1', storeId: 'store-1', status: 'IN_PROGRESS' },
    order: { id: 'order-1', status: 'OUT_FOR_DELIVERY' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.deliveryJob.findFirst).mockResolvedValue(null);
  vi.mocked(jobHasPickedUp).mockResolvedValue(false);
});

describe('reportVehicleFailure — pre-pickup vs idle vs in-progress', () => {
  it('tells the rider to reject when they hold an assigned job that is not picked up', async () => {
    vi.mocked(prisma.deliveryJob.findFirst).mockResolvedValue({
      id: 'job-1',
      status: 'ASSIGNED',
    } as never);
    const next = createMockNext();

    await reportVehicleFailure(req(), createMockRes(), next);

    const err = thrownError(next);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe(REJECT_JOB_BEFORE_FAILURE_MESSAGE);
    expect(recordVehicleFailureAndReleaseJob).not.toHaveBeenCalled();
    expect(broadcastVehicleFailureReported).not.toHaveBeenCalled();
  });

  it('keeps the idle-driver message when there is no held job', async () => {
    const next = createMockNext();

    await reportVehicleFailure(req(), createMockRes(), next);

    const err = thrownError(next);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('No active delivery to report a vehicle failure for');
    expect(recordVehicleFailureAndReleaseJob).not.toHaveBeenCalled();
  });

  it('records a vehicle failure for an in-progress ride', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(inProgressLink() as never);
    const res = createMockRes();

    await reportVehicleFailure(req({ lat: 6.87, lng: 79.89, note: 'Puncture' }), res, createMockNext());

    expect(recordVehicleFailureAndReleaseJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      driverId: DRIVER_ID,
      storeId: 'store-1',
      fromSequence: 1,
      lat: 6.87,
      lng: 79.89,
      note: 'Puncture',
    });
    expect(persistJobActualRouteFromGps).toHaveBeenCalledWith('job-1');
    expect(broadcastVehicleFailureReported).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({ jobId: 'job-1', driverId: DRIVER_ID, orderId: 'order-1' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        jobId: 'job-1',
        orderId: 'order-1',
        deliveryFailed: true,
        rideEnteredReturning: false,
        rideReleased: true,
      },
    });
  });

  it('accepts a blank note sent as null', async () => {
    vi.mocked(prisma.deliveryJobOrder.findFirst).mockResolvedValue(inProgressLink() as never);
    const res = createMockRes();

    await reportVehicleFailure(req({ lat: 6.87, lng: 79.89, note: null }), res, createMockNext());

    expect(recordVehicleFailureAndReleaseJob).toHaveBeenCalledWith(
      expect.objectContaining({ note: undefined, lat: 6.87, lng: 79.89 }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('reconnects and retries once when the database socket is reset', async () => {
    const dropped = Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' });
    vi.mocked(prisma.deliveryJobOrder.findFirst)
      .mockRejectedValueOnce(dropped)
      .mockResolvedValueOnce(inProgressLink() as never);
    const res = createMockRes();

    await reportVehicleFailure(req({ lat: 6.87, lng: 79.89, note: 'Puncture' }), res, createMockNext());

    expect(prisma.$connect).toHaveBeenCalledOnce();
    expect(recordVehicleFailureAndReleaseJob).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
