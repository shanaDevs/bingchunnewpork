import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    riderRating: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

vi.mock('../../src/lib/adminDeliveryHelpers', () => ({
  resolveAdminStoreIdForRequest: vi.fn(async () => 'store-1'),
  resolveOptionalAdminStoreIdForRequest: vi.fn(async () => undefined),
  getPendingDeliveryOrders: vi.fn(),
  orderToClusterable: vi.fn(),
}));

vi.mock('../../src/lib/socket', () => ({
  broadcastDeliveryJobUpdated: vi.fn(),
}));

vi.mock('../../src/lib/spaces', () => ({
  uploadDriverAsset: vi.fn(),
  viewableLicenseImageUrl: vi.fn(async (url: string | null) => url),
}));

import { getDriverRatings, listDeliveryDrivers } from '../../src/controllers/adminDeliveryController';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';

const createdAt = new Date('2026-09-10T06:00:00.000Z');

describe('getDriverRatings', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns rider_ratings comments for a driver', async () => {
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({ id: 'driver-1' } as never);
    vi.mocked(prisma.riderRating.findMany).mockResolvedValue([
      {
        id: 'rating-1',
        stars: 5,
        comment: 'Delivered on time · Polite & friendly',
        createdAt,
        order: { orderNumber: 'BC260910-1001' },
      },
    ] as never);

    const req = createMockReq({ params: { id: 'driver-1' } });
    const res = createMockRes();
    await getDriverRatings(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        average: 5,
        count: 1,
        ratings: [
          {
            id: 'rating-1',
            orderNumber: 'BC260910-1001',
            stars: 5,
            comment: 'Delivered on time · Polite & friendly',
            createdAt: createdAt.toISOString(),
          },
        ],
      },
    });
  });

  it('returns 404 when the driver does not exist', async () => {
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue(null);

    const req = createMockReq({ params: { id: 'missing' } });
    const res = createMockRes();
    await getDriverRatings(req, res, next);

    expect(asMockFn(next)).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
    expect(prisma.riderRating.findMany).not.toHaveBeenCalled();
  });
});

describe('listDeliveryDrivers rating aggregates', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses rider_ratings groupBy instead of job caches', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      {
        id: 'driver-1',
        name: 'Amal',
        phone: '0771234567',
        nicNumber: '123',
        address: null,
        vehicleType: null,
        vehicleNumber: 'ABC-1234',
        vehicleColor: null,
        licenseNumber: null,
        disabilities: null,
        profilePhotoUrl: null,
        licenseImageUrl: null,
        isActive: true,
        dutyStatus: 'OFF_DUTY',
        meritPoints: 100,
        lastLoginAt: null,
        pinLookup: null,
        store: { id: 'store-1', name: 'Nugegoda', city: 'Nugegoda' },
        accessibleStores: [],
        deliveryJobs: [
          { storeId: 'store-1', totalDeliveryFees: 200, riderRatingSum: 0, riderRatingCount: 0 },
        ],
      },
    ] as never);
    vi.mocked(prisma.riderRating.groupBy).mockResolvedValue([
      { driverId: 'driver-1', _avg: { stars: 4.5 }, _count: { _all: 2 } },
    ] as never);

    const req = createMockReq({ query: {} });
    const res = createMockRes();
    await listDeliveryDrivers(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(prisma.riderRating.groupBy).toHaveBeenCalled();
    expect(prisma.adminUser.count).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          id: 'driver-1',
          avgRiderRating: 4.5,
          riderRatingCount: 2,
        }),
      ],
    });
  });

  it('returns one page when page is set and filters by name, status, and duty', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      {
        id: 'driver-1',
        name: 'Amal',
        phone: '0771234567',
        nicNumber: '123',
        address: null,
        vehicleType: null,
        vehicleNumber: 'ABC-1234',
        vehicleColor: null,
        licenseNumber: null,
        disabilities: null,
        profilePhotoUrl: null,
        licenseImageUrl: null,
        isActive: true,
        dutyStatus: 'ONLINE',
        meritPoints: 100,
        lastLoginAt: null,
        pinLookup: null,
        store: { id: 'store-1', name: 'Nugegoda', city: 'Nugegoda' },
        accessibleStores: [],
        deliveryJobs: [],
      },
    ] as never);
    vi.mocked(prisma.adminUser.count).mockResolvedValue(25);
    vi.mocked(prisma.riderRating.groupBy).mockResolvedValue([] as never);

    const req = createMockReq({
      query: { page: '2', pageSize: '10', name: 'am', isActive: 'true', dutyStatus: 'ONLINE' },
    });
    const res = createMockRes();
    await listDeliveryDrivers(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(prisma.adminUser.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        name: { contains: 'am', mode: 'insensitive' },
        isActive: true,
        dutyStatus: 'ONLINE',
      }),
    });
    expect(prisma.adminUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        rows: [expect.objectContaining({ id: 'driver-1', avgRiderRating: null, riderRatingCount: 0 })],
        total: 25,
        page: 2,
        pageSize: 10,
      },
    });
  });
});
