import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

const SCOPED_STORE = 'store-moratuwa';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: { findMany: vi.fn() },
    store: { findUnique: vi.fn() },
  },
}));

vi.mock('../../src/lib/adminDeliveryHelpers', () => ({
  resolveAdminStoreIdForRequest: vi.fn(async () => SCOPED_STORE),
  resolveOptionalAdminStoreIdForRequest: vi.fn(async () => SCOPED_STORE),
  getPendingDeliveryOrders: vi.fn(),
  orderToClusterable: vi.fn(),
}));

import { listLiveDrivers } from '../../src/controllers/adminDeliveryController';
import { prisma } from '../../src/lib/prisma';

describe('listLiveDrivers', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([]);
    vi.mocked(prisma.store.findUnique).mockResolvedValue({
      id: SCOPED_STORE,
      name: 'Bing Chun - Moratuwa',
    } as never);
  });

  it('scoped query does not match pool riders via accessibleStores', async () => {
    const req = createMockReq({ query: { storeId: SCOPED_STORE } });
    const res = createMockRes();
    await listLiveDrivers(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(prisma.adminUser.findMany).toHaveBeenCalledTimes(1);

    const where = vi.mocked(prisma.adminUser.findMany).mock.calls[0]![0]!.where as {
      AND?: unknown[];
    };
    const whereText = JSON.stringify(where);
    expect(whereText).not.toContain('accessibleStores');

    const scopedBranchFilter = where.AND?.find(
      (clause) =>
        typeof clause === 'object' &&
        clause !== null &&
        'OR' in clause &&
        Array.isArray((clause as { OR: unknown[] }).OR) &&
        (clause as { OR: unknown[] }).OR.some(
          (item) => typeof item === 'object' && item !== null && 'storeId' in item,
        ),
    ) as { OR: unknown[] } | undefined;

    expect(scopedBranchFilter?.OR).toEqual(
      expect.arrayContaining([
        { storeId: SCOPED_STORE },
        expect.objectContaining({
          deliveryJobs: expect.objectContaining({
            some: expect.objectContaining({
              storeId: SCOPED_STORE,
            }),
          }),
        }),
      ]),
    );
  });

  it('returns viewing-branch storeName when scoped', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      {
        id: 'driver-1',
        name: 'Cross Branch Rider',
        dutyStatus: 'ON_DELIVERY',
        vehicleNumber: 'ABC-123',
        storeId: 'store-aluthgama',
        store: { id: 'store-aluthgama', name: 'Bing Chun - Aluthgama' },
        driverLocations: [],
        deliveryJobs: [
          { id: 'job-1', status: 'IN_PROGRESS', title: 'Run · 2 orders' },
        ],
      },
    ] as never);

    const req = createMockReq({ query: { storeId: SCOPED_STORE } });
    const res = createMockRes();
    await listLiveDrivers(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          driverId: 'driver-1',
          storeId: SCOPED_STORE,
          storeName: 'Bing Chun - Moratuwa',
        }),
      ],
    });
  });
});
