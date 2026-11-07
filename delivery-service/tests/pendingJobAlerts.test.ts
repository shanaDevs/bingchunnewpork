import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@bingchun/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bingchun/db')>();
  return {
    ...actual,
    prisma: {
      deliveryJob: { findMany: vi.fn() },
      deliveryJobRejection: { findMany: vi.fn() },
    },
  };
});

vi.mock('../src/lib/deliveryJobHelpers', () => ({
  isDriverAlertEligible: vi.fn(),
  buildJobRoutePreview: vi.fn(() => ({
    estimatedDistanceKm: 5,
    estimatedMinutes: 15,
    previewStops: [{ customerName: 'Customer', addressLine: '12 Foo', city: 'Colombo', district: 'Colombo' }],
  })),
  jobOrdersWithDetails: {},
}));

vi.mock('../src/sockets/eventPublisher', () => ({
  getEventPublisher: vi.fn(() => ({
    publish: vi.fn(async () => {}),
  })),
}));

vi.mock('../src/lib/fcm', () => ({
  sendNewJobDataPushToDriver: vi.fn(async () => ({ tokensSent: 1 })),
}));

vi.mock('../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@bingchun/db';
import { isDriverAlertEligible } from '../src/lib/deliveryJobHelpers';
import { getEventPublisher } from '../src/sockets/eventPublisher';
import { sendNewJobDataPushToDriver } from '../src/lib/fcm';
import { replayPendingJobsForDriverGoingOnline } from '../src/lib/pendingJobAlerts';

const store = {
  id: 'store-1',
  name: 'Nugegoda',
  city: 'Colombo',
  lat: 6.9,
  lng: 79.9,
};

function sampleJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    title: 'Evening',
    status: 'SCHEDULED',
    scheduledAt: new Date(),
    storeId: 'store-1',
    driverId: null,
    rideCode: 'R-1',
    totalCups: 4,
    estimatedDistanceKm: 5,
    estimatedMinutes: 20,
    totalDistanceKm: 5,
    totalDeliveryFees: null,
    broadcastedAt: new Date('2026-11-07T08:00:00Z'),
    store,
    jobOrders: [
      {
        sequence: 1,
        order: {
          id: 'o1',
          orderNumber: 'BC-1',
          status: 'OUT_FOR_DELIVERY',
          deliveryFee: 150,
          deliveryLat: 6.91,
          deliveryLng: 79.91,
          deliveryAddressLine: '12 Foo',
          deliveryCity: 'Colombo',
          deliveryDistrict: 'Colombo',
          guestName: null,
          user: { name: 'Ada' },
          address: null,
          items: [{ quantity: 2 }],
        },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.deliveryJobRejection.findMany).mockResolvedValue([]);
  vi.mocked(isDriverAlertEligible).mockResolvedValue(true);
});

describe('replayPendingJobsForDriverGoingOnline', () => {
  it('returns zero when driver is not alert-eligible', async () => {
    vi.mocked(isDriverAlertEligible).mockResolvedValue(false);

    const result = await replayPendingJobsForDriverGoingOnline('driver-1', ['store-1']);

    expect(result.jobsNotified).toBe(0);
    expect(prisma.deliveryJob.findMany).not.toHaveBeenCalled();
  });

  it('notifies via driver room and FCM for unclaimed jobs', async () => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue([sampleJob()] as never);
    const publish = vi.fn(async () => {});
    vi.mocked(getEventPublisher).mockReturnValue({ publish } as never);

    const result = await replayPendingJobsForDriverGoingOnline('driver-1', ['store-1']);

    expect(result.jobsNotified).toBe(1);
    expect(publish).toHaveBeenCalledWith(
      'driver:driver-1',
      'newDeliveryJob',
      expect.objectContaining({ id: 'job-1', forceRing: true }),
    );
    expect(sendNewJobDataPushToDriver).toHaveBeenCalledWith(
      'driver-1',
      expect.objectContaining({ jobId: 'job-1', forceRing: true }),
    );
  });

  it('skips jobs this driver rejected', async () => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue([sampleJob()] as never);
    vi.mocked(prisma.deliveryJobRejection.findMany).mockResolvedValue([
      { jobId: 'job-1' },
    ] as never);

    const result = await replayPendingJobsForDriverGoingOnline('driver-1', ['store-1']);

    expect(result.jobsNotified).toBe(0);
    expect(sendNewJobDataPushToDriver).not.toHaveBeenCalled();
  });

  it('uses jobAssignedToDriver for pre-assigned SCHEDULED jobs', async () => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue([
      sampleJob({ driverId: 'driver-1' }),
    ] as never);
    const publish = vi.fn(async () => {});
    vi.mocked(getEventPublisher).mockReturnValue({ publish } as never);

    await replayPendingJobsForDriverGoingOnline('driver-1', ['store-1']);

    expect(publish).toHaveBeenCalledWith(
      'driver:driver-1',
      'jobAssignedToDriver',
      expect.objectContaining({ jobId: 'job-1', forceRing: true }),
    );
  });
});
