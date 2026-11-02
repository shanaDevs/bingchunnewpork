import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    riderRating: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/driverShift', () => ({
  openDriverShift: vi.fn(),
  closeDriverShift: vi.fn(),
  listDriverShifts: vi.fn(),
}));

vi.mock('../../src/lib/socket', () => ({
  broadcastDriverDutyChanged: vi.fn(),
  broadcastDeliveryJobUpdated: vi.fn(),
}));

vi.mock('../../src/lib/driverAccess', () => ({
  getDriverAccessibleStoreIds: vi.fn(async () => ['store-home']),
}));

vi.mock('../../src/lib/meritPoints', () => ({
  meritStatusBand: vi.fn(() => 'good'),
}));

vi.mock('@bingchun/delivery-domain', () => ({
  computeRiderStats: vi.fn(),
  isRiderStatsPeriod: vi.fn(),
}));

vi.mock('../../src/lib/deliveryJobHelpers', () => ({
  canDriverClaimMore: vi.fn(),
  getDriverActiveRidePhase: vi.fn(),
  isDriverAlertEligible: vi.fn(),
}));

import { getRatings } from '../../src/controllers/driverSelfController';
import { prisma } from '../../src/lib/prisma';

const createdAt = new Date('2026-09-10T06:30:00.000Z');

describe('getRatings', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns this rider\'s reviews with comments', async () => {
    vi.mocked(prisma.riderRating.findMany).mockResolvedValue([
      {
        id: 'rating-1',
        stars: 4,
        comment: 'Food handled carefully',
        createdAt,
        order: { orderNumber: 'BC260910-1002' },
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'driver-1', type: 'admin', role: 'DELIVERY_DRIVER' },
    });
    const res = createMockRes();
    await getRatings(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(prisma.riderRating.findMany).toHaveBeenCalledWith({
      where: { driverId: 'driver-1' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { order: { select: { orderNumber: true } } },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        average: 4,
        count: 1,
        ratings: [
          {
            id: 'rating-1',
            orderNumber: 'BC260910-1002',
            stars: 4,
            comment: 'Food handled carefully',
            createdAt: createdAt.toISOString(),
          },
        ],
      },
    });
  });

  it('returns an empty list when the rider has no reviews', async () => {
    vi.mocked(prisma.riderRating.findMany).mockResolvedValue([] as never);

    const req = createMockReq({
      user: { sub: 'driver-1', type: 'admin', role: 'DELIVERY_DRIVER' },
    });
    const res = createMockRes();
    await getRatings(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { average: null, count: 0, ratings: [] },
    });
  });
});
