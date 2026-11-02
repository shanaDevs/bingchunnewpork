import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    deliveryJob: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    deliveryAttempt: {
      findMany: vi.fn(),
    },
    adminUser: {
      update: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/socket', () => ({
  broadcastDeliveryJobUpdated: vi.fn(),
}));

import {
  ALERT_MUTE_JOB_STATUSES,
  DRIVER_HELD_JOB_STATUSES,
  canDriverClaimMore,
  getDriverActiveRidePhase,
  isDriverAlertEligible,
  maybeEnterReturningPhase,
  releaseDriverWhenIdle,
} from '../../src/lib/deliveryJobHelpers';
import { prisma } from '../../src/lib/prisma';
import { broadcastDeliveryJobUpdated } from '../../src/lib/socket';

const heldJobs = (statuses: string[]) => statuses.map((status) => ({ status })) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * "Ring the driver only when they have no ongoing orders, or are returning to the
 * branch" — RETURNING and QUEUED must stay ringable, ASSIGNED/IN_PROGRESS must not.
 */
describe('isDriverAlertEligible', () => {
  it('queries only the muting statuses, not every held status', async () => {
    vi.mocked(prisma.deliveryJob.count).mockResolvedValue(0 as never);

    await isDriverAlertEligible('driver-1');

    expect(prisma.deliveryJob.count).toHaveBeenCalledWith({
      where: { driverId: 'driver-1', status: { in: [...ALERT_MUTE_JOB_STATUSES] } },
    });
    expect([...ALERT_MUTE_JOB_STATUSES]).toEqual(['ASSIGNED', 'IN_PROGRESS', 'QUEUED']);
  });

  it('is eligible when nothing is muting — idle or only RETURNING', async () => {
    vi.mocked(prisma.deliveryJob.count).mockResolvedValue(0 as never);
    expect(await isDriverAlertEligible('driver-1')).toBe(true);
  });

  it('is muted while actively delivering', async () => {
    vi.mocked(prisma.deliveryJob.count).mockResolvedValue(1 as never);
    expect(await isDriverAlertEligible('driver-1')).toBe(false);
  });
});

describe('canDriverClaimMore', () => {
  it('allows a claim when the driver holds nothing', async () => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue(heldJobs([]));
    expect(await canDriverClaimMore('driver-1')).toBe(true);
  });

  it('allows one queued-next job on top of an active run', async () => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue(heldJobs(['ASSIGNED']));
    expect(await canDriverClaimMore('driver-1')).toBe(true);
  });

  it('refuses stacking a third job once a run plus a queued job are held', async () => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue(heldJobs(['IN_PROGRESS', 'QUEUED']));
    expect(await canDriverClaimMore('driver-1')).toBe(false);
  });

  it('allows a claim while returning to the branch', async () => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue(heldJobs(['RETURNING']));
    expect(await canDriverClaimMore('driver-1')).toBe(true);
  });

  it('still allows a claim holding RETURNING plus a queued job', async () => {
    // RETURNING is not a "current run", so the queue slot is the only thing held.
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue(heldJobs(['RETURNING', 'QUEUED']));
    expect(await canDriverClaimMore('driver-1')).toBe(true);
  });
});

describe('getDriverActiveRidePhase', () => {
  it.each([
    [['IN_PROGRESS', 'QUEUED'], 'IN_PROGRESS'],
    [['ASSIGNED', 'RETURNING'], 'ASSIGNED'],
    [['RETURNING', 'QUEUED'], 'RETURNING'],
    [['QUEUED'], 'QUEUED'],
    [[], 'NONE'],
  ])('reports %j as %s', async (statuses, expected) => {
    vi.mocked(prisma.deliveryJob.findMany).mockResolvedValue(heldJobs(statuses as string[]));
    expect(await getDriverActiveRidePhase('driver-1')).toBe(expected);
  });
});

describe('releaseDriverWhenIdle', () => {
  it('flips the driver back to ONLINE once nothing is held', async () => {
    vi.mocked(prisma.deliveryJob.count).mockResolvedValue(0 as never);

    await releaseDriverWhenIdle('driver-1');

    expect(prisma.adminUser.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { dutyStatus: 'ONLINE' },
    });
  });

  it('counts RETURNING as held, so the rider stays ON_DELIVERY until they get back', async () => {
    vi.mocked(prisma.deliveryJob.count).mockResolvedValue(1 as never);

    await releaseDriverWhenIdle('driver-1');

    expect(prisma.deliveryJob.count).toHaveBeenCalledWith({
      where: { driverId: 'driver-1', status: { in: [...DRIVER_HELD_JOB_STATUSES] } },
    });
    expect(DRIVER_HELD_JOB_STATUSES).toContain('RETURNING');
    expect(prisma.adminUser.update).not.toHaveBeenCalled();
  });

  it('is a no-op without a driver id', async () => {
    await releaseDriverWhenIdle(null);
    expect(prisma.deliveryJob.count).not.toHaveBeenCalled();
  });
});

describe('maybeEnterReturningPhase', () => {
  const job = (status: string, orderStatuses: string[]) => ({
    id: 'job-1',
    status,
    storeId: 'store-1',
    jobOrders: orderStatuses.map((s, i) => ({
      orderId: `order-${i}`,
      order: { id: `order-${i}`, status: s },
    })),
  });

  it('moves a finished run to RETURNING instead of completing it outright', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      job('IN_PROGRESS', ['DELIVERED', 'DELIVERED']) as never,
    );
    vi.mocked(prisma.deliveryAttempt.findMany).mockResolvedValue([] as never);

    expect(await maybeEnterReturningPhase('job-1')).toBe(true);
    expect(prisma.deliveryJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: 'RETURNING', returnStartedAt: expect.any(Date) },
    });
    expect(broadcastDeliveryJobUpdated).toHaveBeenCalledWith('store-1', {
      jobId: 'job-1',
      status: 'RETURNING',
    });
  });

  it('treats a cancelled order as resolved', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      job('IN_PROGRESS', ['DELIVERED', 'CANCELLED']) as never,
    );
    vi.mocked(prisma.deliveryAttempt.findMany).mockResolvedValue([] as never);

    expect(await maybeEnterReturningPhase('job-1')).toBe(true);
  });

  it('treats a failed attempt as resolved so the rider can finish the run', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      job('IN_PROGRESS', ['DELIVERED', 'OUT_FOR_DELIVERY']) as never,
    );
    vi.mocked(prisma.deliveryAttempt.findMany).mockResolvedValue([
      { orderId: 'order-1' },
    ] as never);

    expect(await maybeEnterReturningPhase('job-1')).toBe(true);
  });

  it('stays put while a stop is still pending', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      job('IN_PROGRESS', ['DELIVERED', 'OUT_FOR_DELIVERY']) as never,
    );
    vi.mocked(prisma.deliveryAttempt.findMany).mockResolvedValue([] as never);

    expect(await maybeEnterReturningPhase('job-1')).toBe(false);
    expect(prisma.deliveryJob.update).not.toHaveBeenCalled();
  });

  it('only transitions out of IN_PROGRESS', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(
      job('ASSIGNED', ['DELIVERED']) as never,
    );

    expect(await maybeEnterReturningPhase('job-1')).toBe(false);
    expect(prisma.deliveryJob.update).not.toHaveBeenCalled();
  });

  it('ignores an empty job', async () => {
    vi.mocked(prisma.deliveryJob.findUnique).mockResolvedValue(job('IN_PROGRESS', []) as never);

    expect(await maybeEnterReturningPhase('job-1')).toBe(false);
    expect(prisma.deliveryJob.update).not.toHaveBeenCalled();
  });
});
