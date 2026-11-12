import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@bingchun/db', () => ({
  prisma: {
    deliveryJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    driverLocation: { findMany: vi.fn().mockResolvedValue([]) },
    deliveryAttempt: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from '@bingchun/db';
import { finalizeDeliveryJob } from '../src/gpsPath';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

const baseJob = {
  id: 'job-1',
  driverId: 'drv-1',
  startedAt: new Date('2026-01-01T10:00:00Z'),
  assignedAt: new Date('2026-01-01T09:50:00Z'),
  createdAt: new Date('2026-01-01T09:00:00Z'),
  completedAt: new Date('2026-01-01T11:00:00Z'),
  actualDistanceKm: null,
  totalDistanceKm: 5,
  store: { lat: 6.9, lng: 79.86 },
  jobOrders: [
    {
      sequence: 1,
      order: {
        status: 'DELIVERED',
        deliveryFee: 150,
        cancelledAtStatus: null,
        deliveryLat: 6.91,
        deliveryLng: 79.87,
        address: null,
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('finalizeDeliveryJob totalDeliveryFees', () => {
  it('includes customer-side failed stop fees when persisting totalDeliveryFees', async () => {
    vi.mocked(prisma.deliveryAttempt.findMany).mockResolvedValue([
      {
        jobId: 'job-1',
        orderId: 'ord-1',
        outcome: 'CUSTOMER_UNREACHABLE',
        note: null,
        attemptNo: 1,
        createdAt: new Date(),
      },
    ] as never);
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue({
      id: 'job-1',
      totalDistanceKm: 5,
      store: { lat: 6.9, lng: 79.86 },
      jobOrders: [
        {
          orderId: 'ord-1',
          sequence: 1,
          order: {
            status: 'OUT_FOR_DELIVERY',
            deliveryFee: 200,
            cancelledAtStatus: null,
            deliveryLat: null,
            deliveryLng: null,
            address: null,
          },
        },
      ],
    } as never);

    await finalizeDeliveryJob('job-1');

    const call = vi.mocked(prisma.deliveryJob.update).mock.calls[0]![0] as {
      data: { totalDeliveryFees: { toFixed: (d: number) => string } };
    };
    expect(call.data.totalDeliveryFees.toFixed(0)).toBe('20000');
  });

  it('persists credited fees as integer cents (150 LKR → 15000)', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue({
      id: 'job-1',
      totalDistanceKm: 5,
      store: { lat: 6.9, lng: 79.86 },
      jobOrders: [
        {
          sequence: 1,
          order: {
            status: 'DELIVERED',
            deliveryFee: 150,
            cancelledAtStatus: null,
            deliveryLat: null,
            deliveryLng: null,
            address: null,
          },
        },
      ],
    } as never);

    await finalizeDeliveryJob('job-1');

    expect(prisma.deliveryJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          totalDeliveryFees: expect.objectContaining({ toFixed: expect.any(Function) }),
        }),
      }),
    );
    const call = vi.mocked(prisma.deliveryJob.update).mock.calls[0]![0] as {
      data: { totalDeliveryFees: { toFixed: (d: number) => string } };
    };
    expect(call.data.totalDeliveryFees.toFixed(0)).toBe('15000');
  });
});

describe('finalizeDeliveryJob actualRoute', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(baseJob as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists road-snapped geometry when OSRM match succeeds', async () => {
    vi.mocked(prisma.driverLocation.findMany).mockResolvedValue([
      { lat: 6.9, lng: 79.86, recordedAt: new Date('2026-01-01T10:01:00Z') },
      { lat: 6.905, lng: 79.865, recordedAt: new Date('2026-01-01T10:05:00Z') },
    ] as never);
    fetchMock.mockResolvedValue(
      jsonResponse({
        code: 'Ok',
        matchings: [
          {
            geometry: {
              coordinates: [
                [79.86, 6.9],
                [79.861, 6.901],
                [79.862, 6.902],
              ],
            },
          },
        ],
      }),
    );

    await finalizeDeliveryJob('job-1');

    const call = vi.mocked(prisma.deliveryJob.update).mock.calls[0]![0] as {
      data: { actualRoute: string };
    };
    expect(JSON.parse(call.data.actualRoute)).toEqual([
      [6.9, 79.86],
      [6.901, 79.861],
      [6.902, 79.862],
    ]);
  });

  it('persists raw GPS when OSRM match fails', async () => {
    vi.mocked(prisma.driverLocation.findMany).mockResolvedValue([
      { lat: 6.9, lng: 79.86, recordedAt: new Date('2026-01-01T10:01:00Z') },
      { lat: 6.91, lng: 79.87, recordedAt: new Date('2026-01-01T10:05:00Z') },
    ] as never);
    fetchMock.mockResolvedValue(jsonResponse({ code: 'NoMatch' }));

    await finalizeDeliveryJob('job-1');

    const call = vi.mocked(prisma.deliveryJob.update).mock.calls[0]![0] as {
      data: { actualRoute: string };
    };
    expect(JSON.parse(call.data.actualRoute)).toEqual([
      [6.9, 79.86],
      [6.91, 79.87],
    ]);
  });

  it('falls back to store-stop-store when GPS has fewer than 2 points', async () => {
    vi.mocked(prisma.driverLocation.findMany).mockResolvedValue([]);

    await finalizeDeliveryJob('job-1');

    expect(fetchMock).not.toHaveBeenCalled();
    const call = vi.mocked(prisma.deliveryJob.update).mock.calls[0]![0] as {
      data: { actualRoute: string };
    };
    expect(JSON.parse(call.data.actualRoute)).toEqual([
      [6.9, 79.86],
      [6.91, 79.87],
      [6.9, 79.86],
    ]);
  });
});
