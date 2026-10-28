import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: { findFirst: vi.fn() },
    store: { findMany: vi.fn() },
    riderRating: { aggregate: vi.fn() },
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
  getDriverAccessibleStoreIds: vi.fn(async () => ['store-1']),
}));

vi.mock('../../src/lib/meritPoints', () => ({
  meritStatusBand: vi.fn(() => 'GOOD'),
}));

vi.mock('@bingchun/delivery-domain', () => ({
  patchDriverOpsProfile: vi.fn(),
  computeRiderStats: vi.fn(),
  isRiderStatsPeriod: vi.fn(),
}));

vi.mock('../../src/lib/deliveryJobHelpers', () => ({
  canDriverClaimMore: vi.fn(async () => true),
  getDriverActiveRidePhase: vi.fn(async () => 'NONE'),
  isDriverAlertEligible: vi.fn(async () => true),
}));

vi.mock('../../src/lib/spaces', () => ({
  viewableLicenseImageUrl: vi.fn(async (url: string | null | undefined) => {
    if (!url) return null;
    if (url.includes('/drivers/license/')) return 'https://signed.example/license?X-Amz-Signature=abc';
    return url;
  }),
}));

import { getMe } from '../../src/controllers/driverSelfController';
import { prisma } from '../../src/lib/prisma';

describe('driverSelfController.getMe', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-1', name: 'Bing Chun - Test', city: 'Colombo' },
    ] as never);
    vi.mocked(prisma.riderRating.aggregate).mockResolvedValue({
      _avg: { stars: 4.5 },
      _count: { _all: 3 },
    } as never);
  });

  it('includes nicNumber in the driver profile payload', async () => {
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      id: 'driver-1',
      name: 'Test Rider',
      phone: '0771234567',
      nicNumber: '200012345678',
      address: null,
      vehicleType: 'Bike',
      vehicleNumber: 'ABC-1234',
      vehicleColor: 'Red',
      licenseNumber: 'B1234567',
      disabilities: null,
      profilePhotoUrl: 'https://cdn.example/photo.jpg',
      licenseImageUrl: 'https://cdn.example/license.jpg',
      dutyStatus: 'OFF_DUTY',
      meritPoints: 100,
      consecutiveSuccessfulDeliveries: 5,
      storeId: 'store-1',
      store: { id: 'store-1', name: 'Bing Chun - Test', city: 'Colombo' },
      accessibleStores: [],
    } as never);

    const req = createMockReq({
      user: { sub: 'driver-1', type: 'admin', role: 'DELIVERY_DRIVER' },
    });
    const res = createMockRes();
    await getMe(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        nicNumber: '200012345678',
        consecutiveSuccessfulDeliveries: 5,
        licenseImageUrl: 'https://cdn.example/license.jpg',
      }),
    });
  });

  it('returns a viewable licence URL instead of the stored private object', async () => {
    const stored =
      'https://sgp1.digitaloceanspaces.com/dartcodes.data/bingchun/drivers/license/licence.jpg';
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      id: 'driver-1',
      name: 'Test Rider',
      phone: '0771234567',
      nicNumber: '200012345678',
      address: null,
      vehicleType: 'Bike',
      vehicleNumber: 'ABC-1234',
      vehicleColor: 'Red',
      licenseNumber: 'B1234567',
      disabilities: null,
      profilePhotoUrl: null,
      licenseImageUrl: stored,
      dutyStatus: 'OFF_DUTY',
      meritPoints: 100,
      consecutiveSuccessfulDeliveries: 0,
      storeId: 'store-1',
      store: { id: 'store-1', name: 'Bing Chun - Test', city: 'Colombo' },
      accessibleStores: [],
    } as never);

    const req = createMockReq({
      user: { sub: 'driver-1', type: 'admin', role: 'DELIVERY_DRIVER' },
    });
    const res = createMockRes();
    await getMe(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    const body = asMockFn(res.json).mock.calls[0][0] as {
      data: { licenseImageUrl: string };
    };
    expect(body.data.licenseImageUrl).toBe('https://signed.example/license?X-Amz-Signature=abc');
    expect(body.data.licenseImageUrl).not.toBe(stored);
  });
});
