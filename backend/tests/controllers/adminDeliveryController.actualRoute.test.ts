import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryJob: { findUnique: vi.fn() },
  },
}));

vi.mock('../../src/lib/deliveryJobHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/deliveryJobHelpers')>();
  return {
    ...actual,
    fetchJobGpsLocations: vi.fn(),
    snapGpsPathForDisplay: vi.fn(async (locations: Array<{ lat: number; lng: number }>) => locations),
  };
});

import { getAdminDeliveryJobActualRoute } from '../../src/controllers/adminDeliveryController';
import { prisma } from '../../src/lib/prisma';
import { fetchJobGpsLocations } from '../../src/lib/deliveryJobHelpers';

const startedAt = new Date('2026-09-10T08:00:00.000Z');
const completedAt = new Date('2026-09-10T09:00:00.000Z');

function jobFixture(status: string, id = 'job-vf-1') {
  return {
    id,
    storeId: 'store-1',
    status,
    rideCode: 'RIDE-0001',
    title: 'Morning run',
    actualRoute: null,
    startedAt,
    completedAt,
    assignedAt: startedAt,
    createdAt: startedAt,
    driverId: 'driver-1',
    estimatedDistanceKm: 12,
    estimatedMinutes: 45,
    totalDistanceKm: 12,
    actualDistanceKm: 4.2,
    store: {
      id: 'store-1',
      name: 'Branch',
      lat: 6.91,
      lng: 79.86,
      addressLine: 'Main St',
      city: 'Colombo',
    },
    jobOrders: [],
  };
}

function vehicleFailureJob() {
  return jobFixture('VEHICLE_FAILURE');
}

describe('getAdminDeliveryJobActualRoute — vehicle failure GPS replay', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to driver_locations when actualRoute is empty for VEHICLE_FAILURE', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(vehicleFailureJob() as never);
    vi.mocked(fetchJobGpsLocations).mockResolvedValue([
      { lat: 6.91, lng: 79.86, recordedAt: startedAt },
      { lat: 6.92, lng: 79.87, recordedAt: new Date('2026-09-10T08:30:00.000Z') },
      { lat: 6.93, lng: 79.88, recordedAt: completedAt },
    ]);

    const req = createMockReq({
      params: { id: 'job-vf-1' },
      query: { storeId: 'store-1' },
      user: { role: 'ADMIN', storeId: 'store-1' },
    });
    const res = createMockRes();

    await getAdminDeliveryJobActualRoute(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(fetchJobGpsLocations).toHaveBeenCalledWith(
      'job-vf-1',
      startedAt,
      completedAt,
      'driver-1',
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        jobId: 'job-vf-1',
        status: 'VEHICLE_FAILURE',
        source: 'gps_fallback',
      }),
    });
    const payload = asMockFn(res.json).mock.calls[0][0].data as { path: Array<{ lat: number; lng: number }> };
    expect(payload.path).toHaveLength(3);
    expect(payload.path[0]).toMatchObject({ lat: 6.91, lng: 79.86 });
  });

  it('falls back to driver_locations when actualRoute is empty for CANCELLED', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      jobFixture('CANCELLED', 'job-cancel-1') as never,
    );
    vi.mocked(fetchJobGpsLocations).mockResolvedValue([
      { lat: 6.91, lng: 79.86, recordedAt: startedAt },
      { lat: 6.92, lng: 79.87, recordedAt: new Date('2026-09-10T08:30:00.000Z') },
    ]);

    const req = createMockReq({
      params: { id: 'job-cancel-1' },
      query: { storeId: 'store-1' },
      user: { role: 'ADMIN', storeId: 'store-1' },
    });
    const res = createMockRes();

    await getAdminDeliveryJobActualRoute(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(fetchJobGpsLocations).toHaveBeenCalledWith(
      'job-cancel-1',
      startedAt,
      completedAt,
      'driver-1',
    );
    const payload = asMockFn(res.json).mock.calls[0][0].data as {
      source: string;
      path: Array<{ lat: number; lng: number }>;
    };
    expect(payload.source).toBe('gps_fallback');
    expect(payload.path).toHaveLength(2);
  });

  it('falls back to driver_locations for a past-due IN_PROGRESS incomplete job', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      jobFixture('IN_PROGRESS', 'job-stuck-1') as never,
    );
    vi.mocked(fetchJobGpsLocations).mockResolvedValue([
      { lat: 6.91, lng: 79.86, recordedAt: startedAt },
      { lat: 6.925, lng: 79.875, recordedAt: new Date('2026-09-10T08:20:00.000Z') },
    ]);

    const req = createMockReq({
      params: { id: 'job-stuck-1' },
      query: { storeId: 'store-1' },
      user: { role: 'ADMIN', storeId: 'store-1' },
    });
    const res = createMockRes();

    await getAdminDeliveryJobActualRoute(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(fetchJobGpsLocations).toHaveBeenCalled();
    const payload = asMockFn(res.json).mock.calls[0][0].data as { source: string; path: unknown[] };
    expect(payload.source).toBe('gps_fallback');
    expect(payload.path).toHaveLength(2);
  });
});
