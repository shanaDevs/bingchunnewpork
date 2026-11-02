import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    driverBranchRequest: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    store: { findMany: vi.fn(), findUnique: vi.fn() },
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

import { createBranchRequest, listMyBranchRequests } from '../../src/controllers/driverSelfController';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';

describe('listMyBranchRequests', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns this driver\'s requests with store names', async () => {
    vi.mocked(prisma.driverBranchRequest.findMany).mockResolvedValue([
      {
        id: 'req-1',
        driverId: 'driver-1',
        type: 'ADD_BRANCH',
        fromStoreId: 'store-home',
        toStoreId: 'store-other',
        status: 'PENDING',
        reason: null,
        reviewNote: null,
        createdAt: new Date('2026-09-10T05:00:00.000Z'),
      },
    ] as never);
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-home', name: 'Nugegoda' },
      { id: 'store-other', name: 'Kandy' },
    ] as never);

    const req = createMockReq({
      user: { sub: 'driver-1', type: 'admin', role: 'DELIVERY_DRIVER' },
    });
    const res = createMockRes();

    await listMyBranchRequests(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(prisma.driverBranchRequest.findMany).toHaveBeenCalledWith({
      where: { driverId: 'driver-1' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          id: 'req-1',
          toStoreId: 'store-other',
          toStoreName: 'Kandy',
          fromStoreName: 'Nugegoda',
          status: 'PENDING',
        }),
      ],
    });
  });
});

describe('createBranchRequest home branch', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.store.findUnique).mockResolvedValue({ id: 'store-other' } as never);
    vi.mocked(prisma.driverBranchRequest.findFirst).mockResolvedValue(null);
  });

  function requestChange(toStoreId: string) {
    return createMockReq({
      user: { sub: 'driver-1', type: 'admin', role: 'DELIVERY_DRIVER' },
      body: { type: 'CHANGE_BRANCH', toStoreId },
    });
  }

  it('rejects a home change when the rider has only one assigned branch', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: 'store-home',
      accessibleStores: [{ id: 'store-home' }],
    } as never);

    const res = createMockRes();
    await createBranchRequest(requestChange('store-other'), res, next);

    expect(asMockFn(next)).toHaveBeenCalledWith(expect.any(AppError));
    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe(
      'You only have one assigned branch, so you cannot change your home branch.',
    );
    expect(prisma.driverBranchRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a home change to a branch the rider is not assigned to', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: 'store-home',
      accessibleStores: [{ id: 'store-home' }, { id: 'store-extra' }],
    } as never);
    vi.mocked(prisma.store.findUnique).mockResolvedValue({ id: 'store-unassigned' } as never);

    const res = createMockRes();
    await createBranchRequest(requestChange('store-unassigned'), res, next);

    expect(asMockFn(next)).toHaveBeenCalledWith(expect.any(AppError));
    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe(
      'You can only change your home branch to a branch you are already assigned to',
    );
    expect(prisma.driverBranchRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a home change to the branch that is already home', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: 'store-home',
      accessibleStores: [{ id: 'store-home' }, { id: 'store-extra' }],
    } as never);
    vi.mocked(prisma.store.findUnique).mockResolvedValue({ id: 'store-home' } as never);

    const res = createMockRes();
    await createBranchRequest(requestChange('store-home'), res, next);

    expect(asMockFn(next)).toHaveBeenCalledWith(expect.any(AppError));
    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Choose another assigned branch as your home branch');
    expect(prisma.driverBranchRequest.create).not.toHaveBeenCalled();
  });
});
