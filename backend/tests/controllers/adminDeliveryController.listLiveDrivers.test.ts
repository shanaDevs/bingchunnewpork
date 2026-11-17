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
      lat: 6.773,
      lng: 79.882,
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
        store: { id: 'store-aluthgama', name: 'Bing Chun - Aluthgama', lat: 6.43, lng: 80.0 },
        driverLocations: [],
        deliveryJobs: [
          {
            id: 'job-1',
            status: 'IN_PROGRESS',
            title: 'Run · 2 orders',
            startedAt: new Date('2026-11-16T05:00:00.000Z'),
            jobOrders: [
              {
                orderId: 'order-1',
                sequence: 1,
                order: {
                  id: 'order-1',
                  orderNumber: 'BC-1',
                  status: 'OUT_FOR_DELIVERY',
                  cancelReason: null,
                  deliveryLat: 6.82,
                  deliveryLng: 79.89,
                },
              },
            ],
          },
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
          currentJob: expect.objectContaining({
            id: 'job-1',
            status: 'IN_PROGRESS',
            pickedUp: true,
            orders: [
              expect.objectContaining({
                orderId: 'order-1',
                sequence: 1,
                deliveryState: 'Pending',
              }),
            ],
            nextStop: expect.objectContaining({
              kind: 'stop',
              sequence: 1,
              label: '#1',
              lat: 6.82,
              lng: 79.89,
            }),
            lastDropoff: null,
          }),
        }),
      ],
    });
  });

  it('returns lastDropoff at actual GPS after a delivered stop', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      {
        id: 'driver-1',
        name: 'Rider',
        dutyStatus: 'ON_DELIVERY',
        vehicleNumber: 'ABC-123',
        storeId: SCOPED_STORE,
        store: { id: SCOPED_STORE, name: 'Bing Chun - Moratuwa', lat: 6.773, lng: 79.882 },
        driverLocations: [{ lat: 6.83, lng: 79.9, recordedAt: new Date(), jobId: 'job-1', heading: 90 }],
        deliveryJobs: [
          {
            id: 'job-1',
            status: 'IN_PROGRESS',
            title: 'Run · 2 orders',
            startedAt: new Date('2026-11-16T05:00:00.000Z'),
            jobOrders: [
              {
                orderId: 'order-1',
                sequence: 1,
                order: {
                  id: 'order-1',
                  orderNumber: 'BC-1',
                  status: 'DELIVERED',
                  cancelReason: null,
                  deliveryLat: 6.82,
                  deliveryLng: 79.89,
                  actualDropoffLat: 6.8215,
                  actualDropoffLng: 79.891,
                  actualDropoffAt: '2026-11-16T05:20:00.000Z',
                },
              },
              {
                orderId: 'order-2',
                sequence: 2,
                order: {
                  id: 'order-2',
                  orderNumber: 'BC-2',
                  status: 'OUT_FOR_DELIVERY',
                  cancelReason: null,
                  deliveryLat: 6.83,
                  deliveryLng: 79.9,
                  actualDropoffLat: null,
                  actualDropoffLng: null,
                  actualDropoffAt: null,
                },
              },
            ],
          },
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
          currentJob: expect.objectContaining({
            lastDropoff: expect.objectContaining({
              kind: 'dropoff',
              orderId: 'order-1',
              lat: 6.8215,
              lng: 79.891,
              actual: true,
            }),
            nextStop: expect.objectContaining({
              kind: 'stop',
              sequence: 2,
            }),
          }),
        }),
      ],
    });
  });
});
