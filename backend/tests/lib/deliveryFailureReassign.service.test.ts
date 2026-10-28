import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryAttempt: { findUnique: vi.fn() },
    deliveryJobOrder: { findMany: vi.fn() },
    deliveryJob: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    adminUser: { findFirst: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock('../../src/lib/driverAccess', () => ({
  getDriverAccessibleStoreIds: vi.fn(),
}));

vi.mock('../../src/lib/deliveryJobHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/deliveryJobHelpers')>();
  return {
    ...actual,
    allocateRideCode: vi.fn().mockResolvedValue('RIDE-2001'),
    maybeEnterReturningPhase: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('../../src/lib/driverPush', () => ({
  sendPushToDriver: vi.fn().mockResolvedValue({ tokensSent: 1 }),
}));

vi.mock('../../src/lib/socket', () => ({
  broadcastJobAssignedToDriver: vi.fn(),
  broadcastDeliveryJobUpdated: vi.fn(),
}));

vi.mock('../../src/lib/roadRouting', () => ({
  fetchRoadRoute: vi.fn().mockRejectedValue(new Error('skip road')),
  buildRouteWaypoints: vi.fn().mockReturnValue([]),
}));

import { prisma } from '../../src/lib/prisma';
import { getDriverAccessibleStoreIds } from '../../src/lib/driverAccess';
import { reassignFailedDeliveryOrder, reassignFailedDeliveryOrders } from '../../src/lib/deliveryFailureReassign';
import { sendPushToDriver } from '../../src/lib/driverPush';
import { broadcastJobAssignedToDriver } from '../../src/lib/socket';
import { maybeEnterReturningPhase } from '../../src/lib/deliveryJobHelpers';

const attemptBase = {
  id: 'att-1',
  jobId: 'job-orig',
  orderId: 'ord-1',
  outcome: 'CUSTOMER_UNREACHABLE',
  order: {
    id: 'ord-1',
    orderNumber: '1042',
    status: 'OUT_FOR_DELIVERY',
    storeId: 'store-1',
    store: { id: 'store-1', name: 'Pitakotte', lat: 6.9, lng: 79.85 },
  },
};

function orderRow(overrides: {
  id: string;
  orderNumber: string;
  status?: string;
  lat?: number;
  lng?: number;
  deliveryFee?: number;
  quantity?: number;
}) {
  return {
    id: overrides.id,
    orderNumber: overrides.orderNumber,
    status: overrides.status ?? 'OUT_FOR_DELIVERY',
    storeId: 'store-1',
    guestName: 'Customer',
    guestPhone: '0770000000',
    total: 1000,
    deliveryFee: overrides.deliveryFee ?? 180,
    deliveryAddressLine: '12 Flower Rd',
    deliveryCity: 'Colombo',
    deliveryDistrict: 'Colombo',
    deliveryLat: overrides.lat ?? 6.91,
    deliveryLng: overrides.lng ?? 79.86,
    user: null,
    address: null,
    items: [
      {
        quantity: overrides.quantity ?? 2,
        productName: 'Milk tea',
        totalPrice: 600,
        product: { imageUrl: null },
      },
    ],
  };
}

const failedStop = {
  orderId: 'ord-1',
  sequence: 2,
  order: orderRow({ id: 'ord-1', orderNumber: '1042' }),
};

function mockJobOrderLookups(originalStops: unknown[], redeliveryLinks: unknown[] = []) {
  vi.mocked(prisma.deliveryJobOrder.findMany).mockImplementation(async (args: never) => {
    const where = (args as { where?: { jobId?: string; orderId?: unknown } }).where;
    if (where?.jobId) return originalStops as never;
    return redeliveryLinks as never;
  });
}

describe('reassignFailedDeliveryOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue([]);
    mockJobOrderLookups([failedStop]);
    vi.mocked(getDriverAccessibleStoreIds).mockResolvedValue(['store-1']);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        deliveryJob: {
          create: vi.fn().mockResolvedValue({
            id: 'job-new',
            status: 'SCHEDULED',
            rideCode: 'RIDE-2001',
            title: 'Redelivery #1042',
          }),
        },
        deliveryJobOrder: { deleteMany: vi.fn() },
        order: { update: vi.fn(), updateMany: vi.fn() },
        orderStatusEvent: { create: vi.fn(), createMany: vi.fn() },
        deliveryEvent: { create: vi.fn(), createMany: vi.fn() },
        adminUser: { update: vi.fn() },
      };
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    });
  });

  it('creates a separate scheduled job pre-assigned to the driver, leaving the original job untouched', async () => {
    vi.mocked(prisma.deliveryAttempt.findUnique).mockResolvedValue(attemptBase as never);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      id: 'd2',
      name: 'Nimal',
      isActive: true,
      dutyStatus: 'ONLINE',
    } as never);

    const result = await reassignFailedDeliveryOrder({
      attemptId: 'att-1',
      driverId: 'd2',
    });

    expect(result).toMatchObject({
      jobId: 'job-new',
      status: 'SCHEDULED',
      driverId: 'd2',
      orderId: 'ord-1',
      originalJobId: 'job-orig',
      orderCount: 1,
    });
    expect(broadcastJobAssignedToDriver).toHaveBeenCalledWith(
      'd2',
      expect.objectContaining({
        jobId: 'job-new',
        storeId: 'store-1',
        orderCount: 1,
        forceRing: true,
      }),
    );
    expect(sendPushToDriver).toHaveBeenCalledWith(
      'd2',
      expect.objectContaining({
        jobId: 'job-new',
        orderCount: 1,
        storeId: 'store-1',
        forceRing: true,
      }),
    );
    expect(maybeEnterReturningPhase).toHaveBeenCalledWith('job-orig');
  });

  it('moves the failed order plus later undelivered stops onto one new job', async () => {
    vi.mocked(prisma.deliveryAttempt.findUnique).mockResolvedValue(attemptBase as never);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      id: 'd2',
      name: 'Nimal',
      isActive: true,
      dutyStatus: 'ONLINE',
    } as never);
    mockJobOrderLookups([
      { orderId: 'ord-0', sequence: 1, order: orderRow({ id: 'ord-0', orderNumber: '1041', status: 'DELIVERED' }) },
      failedStop,
      {
        orderId: 'ord-2',
        sequence: 3,
        order: orderRow({ id: 'ord-2', orderNumber: '1043', lat: 6.92, lng: 79.87 }),
      },
      {
        orderId: 'ord-3',
        sequence: 4,
        order: orderRow({ id: 'ord-3', orderNumber: '1044', lat: 6.93, lng: 79.88 }),
      },
    ]);

    const deleteMany = vi.fn();
    const orderUpdate = vi.fn();
    const orderUpdateMany = vi.fn();
    const create = vi.fn().mockResolvedValue({
      id: 'job-new',
      status: 'SCHEDULED',
      rideCode: 'RIDE-2001',
      title: 'Redelivery #1042 + 2 more',
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        deliveryJob: { create },
        deliveryJobOrder: { deleteMany },
        order: { update: orderUpdate, updateMany: orderUpdateMany },
        orderStatusEvent: { create: vi.fn(), createMany: vi.fn() },
        deliveryEvent: { create: vi.fn(), createMany: vi.fn() },
        adminUser: { update: vi.fn() },
      };
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    });

    const result = await reassignFailedDeliveryOrder({ attemptId: 'att-1', driverId: 'd2' });

    expect(result.orderIds).toEqual(['ord-1', 'ord-2', 'ord-3']);
    expect(result.orderCount).toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { jobId: 'job-orig', orderId: { in: ['ord-2', 'ord-3'] } },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobOrders: {
            create: expect.arrayContaining([
              expect.objectContaining({ orderId: 'ord-1' }),
              expect.objectContaining({ orderId: 'ord-2' }),
              expect.objectContaining({ orderId: 'ord-3' }),
            ]),
          },
        }),
      }),
    );
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(sendPushToDriver).toHaveBeenCalledWith(
      'd2',
      expect.objectContaining({ orderCount: 3, forceRing: true, storeId: 'store-1' }),
    );
  });

  it('reassigns the failed order plus every other undelivered order even for driver error (Other)', async () => {
    vi.mocked(prisma.deliveryAttempt.findUnique).mockResolvedValue({
      ...attemptBase,
      outcome: 'OTHER',
    } as never);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      id: 'd2',
      name: 'Nimal',
      isActive: true,
      dutyStatus: 'ONLINE',
    } as never);
    mockJobOrderLookups([
      failedStop,
      {
        orderId: 'ord-2',
        sequence: 3,
        order: orderRow({ id: 'ord-2', orderNumber: '1043', lat: 6.92, lng: 79.87 }),
      },
    ]);

    const deleteMany = vi.fn();
    const create = vi.fn().mockResolvedValue({
      id: 'job-new',
      status: 'SCHEDULED',
      rideCode: 'RIDE-2001',
      title: 'Redelivery #1042 + 1 more',
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        deliveryJob: { create },
        deliveryJobOrder: { deleteMany },
        order: { update: vi.fn(), updateMany: vi.fn() },
        orderStatusEvent: { create: vi.fn(), createMany: vi.fn() },
        deliveryEvent: { create: vi.fn(), createMany: vi.fn() },
        adminUser: { update: vi.fn() },
      };
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    });

    const result = await reassignFailedDeliveryOrder({ attemptId: 'att-1', driverId: 'd2' });

    expect(result.orderIds).toEqual(['ord-1', 'ord-2']);
    expect(result.orderCount).toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { jobId: 'job-orig', orderId: { in: ['ord-2'] } },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobOrders: {
            create: expect.arrayContaining([
              expect.objectContaining({ orderId: 'ord-1' }),
              expect.objectContaining({ orderId: 'ord-2' }),
            ]),
          },
        }),
      }),
    );
  });

  it('rejects when a later order is already on a redelivery job', async () => {
    vi.mocked(prisma.deliveryAttempt.findUnique).mockResolvedValue(attemptBase as never);
    mockJobOrderLookups(
      [
        failedStop,
        {
          orderId: 'ord-2',
          sequence: 3,
          order: orderRow({ id: 'ord-2', orderNumber: '1043' }),
        },
      ],
      [
        {
          orderId: 'ord-2',
          jobId: 'job-redeliver',
          job: {
            id: 'job-redeliver',
            status: 'ASSIGNED',
            createdAt: new Date('2026-08-31T10:00:00.000Z'),
            driver: { id: 'd3', name: 'Kamal' },
          },
        },
      ],
    );

    await expect(
      reassignFailedDeliveryOrder({ attemptId: 'att-1', driverId: 'd2' }),
    ).rejects.toMatchObject({
      message: 'This ride already has orders assigned to another rider',
      statusCode: 400,
    });
  });

  it('rejects when the order is already delivered', async () => {
    vi.mocked(prisma.deliveryAttempt.findUnique).mockResolvedValue({
      ...attemptBase,
      order: { ...attemptBase.order, status: 'DELIVERED' },
    } as never);

    await expect(
      reassignFailedDeliveryOrder({ attemptId: 'att-1', driverId: 'd2' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('still creates a SCHEDULED job when the chosen rider already has an active run', async () => {
    // ASSIGNED vs QUEUED is no longer decided here — the job always lands as SCHEDULED
    // and takeScheduledJob() sorts out ASSIGNED/QUEUED once the rider actually claims it.
    vi.mocked(prisma.deliveryAttempt.findUnique).mockResolvedValue(attemptBase as never);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      id: 'd2',
      name: 'Nimal',
      isActive: true,
      dutyStatus: 'ON_DELIVERY',
    } as never);
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue([{ status: 'IN_PROGRESS' }] as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const create = vi.fn().mockResolvedValue({
        id: 'job-scheduled',
        status: 'SCHEDULED',
        rideCode: 'RIDE-2001',
        title: 'Redelivery #1042',
      });
      const tx = {
        deliveryJob: { create },
        deliveryJobOrder: { deleteMany: vi.fn() },
        order: { update: vi.fn(), updateMany: vi.fn() },
        orderStatusEvent: { create: vi.fn(), createMany: vi.fn() },
        deliveryEvent: { create: vi.fn(), createMany: vi.fn() },
        adminUser: { update: vi.fn() },
      };
      const result = await (fn as (t: typeof tx) => Promise<unknown>)(tx);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SCHEDULED', driverId: 'd2' }),
        }),
      );
      return result;
    });

    const result = await reassignFailedDeliveryOrder({ attemptId: 'att-1', driverId: 'd2' });
    expect(result.status).toBe('SCHEDULED');
  });

  it('splits forward orders across multiple riders and rings each one', async () => {
    vi.mocked(prisma.deliveryAttempt.findUnique).mockResolvedValue(attemptBase as never);
    vi.mocked(prisma.adminUser.findFirst).mockImplementation(async (args: never) => {
      const where = (args as { where?: { id?: string } }).where;
      const id = where?.id;
      if (id === 'd2') {
        return { id: 'd2', name: 'Nimal', isActive: true, dutyStatus: 'ONLINE' } as never;
      }
      if (id === 'd3') {
        return { id: 'd3', name: 'Kamal', isActive: true, dutyStatus: 'ONLINE' } as never;
      }
      return null;
    });
    mockJobOrderLookups([
      failedStop,
      {
        orderId: 'ord-2',
        sequence: 3,
        order: orderRow({ id: 'ord-2', orderNumber: '1043', lat: 6.92, lng: 79.87 }),
      },
    ]);

    let createCount = 0;
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const create = vi.fn().mockImplementation(async () => {
        createCount += 1;
        return {
          id: createCount === 1 ? 'job-a' : 'job-b',
          status: 'SCHEDULED',
          rideCode: `RIDE-${createCount}`,
          title: createCount === 1 ? 'Redelivery #1042' : 'Redelivery #1043',
        };
      });
      const tx = {
        deliveryJob: { create },
        deliveryJobOrder: { deleteMany: vi.fn() },
        order: { update: vi.fn(), updateMany: vi.fn() },
        orderStatusEvent: { create: vi.fn(), createMany: vi.fn() },
        deliveryEvent: { create: vi.fn(), createMany: vi.fn() },
        adminUser: { update: vi.fn() },
      };
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    });

    const result = await reassignFailedDeliveryOrders({
      attemptId: 'att-1',
      assignments: [
        { driverId: 'd2', orderIds: ['ord-1'] },
        { driverId: 'd3', orderIds: ['ord-2'] },
      ],
    });

    expect(result.jobs).toHaveLength(2);
    expect(result.jobs[0]).toMatchObject({ driverId: 'd2', orderIds: ['ord-1'], orderCount: 1 });
    expect(result.jobs[1]).toMatchObject({ driverId: 'd3', orderIds: ['ord-2'], orderCount: 1 });
    expect(sendPushToDriver).toHaveBeenCalledTimes(2);
    expect(sendPushToDriver).toHaveBeenCalledWith(
      'd2',
      expect.objectContaining({ jobId: 'job-a', orderCount: 1, forceRing: true }),
    );
    expect(sendPushToDriver).toHaveBeenCalledWith(
      'd3',
      expect.objectContaining({ jobId: 'job-b', orderCount: 1, forceRing: true }),
    );
    expect(broadcastJobAssignedToDriver).toHaveBeenCalledTimes(2);
    expect(broadcastJobAssignedToDriver).toHaveBeenCalledWith(
      'd2',
      expect.objectContaining({ jobId: 'job-a', forceRing: true }),
    );
    expect(broadcastJobAssignedToDriver).toHaveBeenCalledWith(
      'd3',
      expect.objectContaining({ jobId: 'job-b', forceRing: true }),
    );
  });

  it('persists the breakdown spot as the pickup override for a vehicle-failure attempt', async () => {
    vi.mocked(prisma.deliveryAttempt.findUnique).mockResolvedValue({
      ...attemptBase,
      outcome: 'VEHICLE_FAILURE',
      lat: 6.905,
      lng: 79.855,
    } as never);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      id: 'd2',
      name: 'Nimal',
      isActive: true,
      dutyStatus: 'ONLINE',
    } as never);

    const create = vi.fn().mockResolvedValue({
      id: 'job-new',
      status: 'SCHEDULED',
      rideCode: 'RIDE-2001',
      title: 'Redelivery #1042',
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        deliveryJob: { create },
        deliveryJobOrder: { deleteMany: vi.fn() },
        order: { update: vi.fn(), updateMany: vi.fn() },
        orderStatusEvent: { create: vi.fn(), createMany: vi.fn() },
        deliveryEvent: { create: vi.fn(), createMany: vi.fn() },
        adminUser: { update: vi.fn() },
      };
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    });

    await reassignFailedDeliveryOrder({ attemptId: 'att-1', driverId: 'd2' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pickupLat: 6.905,
          pickupLng: 79.855,
          pickupLabel: 'Rider breakdown location',
        }),
      }),
    );
  });

  it('leaves the pickup override null for non-vehicle-failure outcomes', async () => {
    vi.mocked(prisma.deliveryAttempt.findUnique).mockResolvedValue({
      ...attemptBase,
      outcome: 'CUSTOMER_UNREACHABLE',
      lat: 6.905,
      lng: 79.855,
    } as never);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      id: 'd2',
      name: 'Nimal',
      isActive: true,
      dutyStatus: 'ONLINE',
    } as never);

    const create = vi.fn().mockResolvedValue({
      id: 'job-new',
      status: 'SCHEDULED',
      rideCode: 'RIDE-2001',
      title: 'Redelivery #1042',
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        deliveryJob: { create },
        deliveryJobOrder: { deleteMany: vi.fn() },
        order: { update: vi.fn(), updateMany: vi.fn() },
        orderStatusEvent: { create: vi.fn(), createMany: vi.fn() },
        deliveryEvent: { create: vi.fn(), createMany: vi.fn() },
        adminUser: { update: vi.fn() },
      };
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    });

    await reassignFailedDeliveryOrder({ attemptId: 'att-1', driverId: 'd2' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pickupLat: null,
          pickupLng: null,
          pickupLabel: null,
        }),
      }),
    );
  });

  it('schedules a job for an off-duty rider without flipping them to on delivery', async () => {
    vi.mocked(prisma.deliveryAttempt.findUnique).mockResolvedValue(attemptBase as never);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      id: 'd4',
      name: 'Saman',
      isActive: true,
      dutyStatus: 'OFF_DUTY',
    } as never);
    const dutyUpdate = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        deliveryJob: {
          create: vi.fn().mockResolvedValue({
            id: 'job-off',
            status: 'SCHEDULED',
            rideCode: 'RIDE-2001',
            title: 'Redelivery #1042',
          }),
        },
        deliveryJobOrder: { deleteMany: vi.fn() },
        order: { update: vi.fn(), updateMany: vi.fn() },
        orderStatusEvent: { create: vi.fn(), createMany: vi.fn() },
        deliveryEvent: { create: vi.fn(), createMany: vi.fn() },
        adminUser: { update: dutyUpdate },
      };
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    });

    const result = await reassignFailedDeliveryOrder({ attemptId: 'att-1', driverId: 'd4' });
    expect(result).toMatchObject({ jobId: 'job-off', status: 'SCHEDULED', driverId: 'd4' });
    expect(dutyUpdate).not.toHaveBeenCalled();
  });

  it('never flips duty status at creation time even for an online rider — that happens only when they claim the job', async () => {
    vi.mocked(prisma.deliveryAttempt.findUnique).mockResolvedValue(attemptBase as never);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      id: 'd2',
      name: 'Nimal',
      isActive: true,
      dutyStatus: 'ONLINE',
    } as never);
    const dutyUpdate = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        deliveryJob: {
          create: vi.fn().mockResolvedValue({
            id: 'job-new',
            status: 'SCHEDULED',
            rideCode: 'RIDE-2001',
            title: 'Redelivery #1042',
          }),
        },
        deliveryJobOrder: { deleteMany: vi.fn() },
        order: { update: vi.fn(), updateMany: vi.fn() },
        orderStatusEvent: { create: vi.fn(), createMany: vi.fn() },
        deliveryEvent: { create: vi.fn(), createMany: vi.fn() },
        adminUser: { update: dutyUpdate },
      };
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    });

    const result = await reassignFailedDeliveryOrder({ attemptId: 'att-1', driverId: 'd2' });
    expect(result.status).toBe('SCHEDULED');
    expect(dutyUpdate).not.toHaveBeenCalled();
  });
});
