import { prisma } from '@bingchun/db';

/** Rider who took over orders from a vehicle-failure job. */
export type ReassignedRiderSummary = {
  id: string;
  name: string;
  phone: string | null;
  jobId: string;
  rideCode: string | null;
  status: string;
};

export type VehicleFailureAttemptRef = {
  jobId: string;
  orderId: string;
  createdAt: Date;
};

export type ReassignedJobLink = {
  orderId: string;
  job: {
    id: string;
    status: string;
    rideCode: string | null;
    createdAt: Date;
    driver: { id: string; name: string; phone: string | null } | null;
  };
};

/**
 * Newest takeover job per rider, ignoring the failed job itself and any job
 * created before the vehicle-failure attempt (an earlier ride that shared an order).
 */
export function pickReassignedRiders(input: {
  failedJobIds: string[];
  attempts: VehicleFailureAttemptRef[];
  links: ReassignedJobLink[];
}): Map<string, ReassignedRiderSummary[]> {
  const failed = new Set(input.failedJobIds);
  const attemptsByJob = new Map<string, { orderIds: Set<string>; earliest: Date }>();
  for (const attempt of input.attempts) {
    if (!failed.has(attempt.jobId)) continue;
    const current = attemptsByJob.get(attempt.jobId);
    if (!current) {
      attemptsByJob.set(attempt.jobId, {
        orderIds: new Set([attempt.orderId]),
        earliest: attempt.createdAt,
      });
      continue;
    }
    current.orderIds.add(attempt.orderId);
    if (attempt.createdAt < current.earliest) current.earliest = attempt.createdAt;
  }

  const result = new Map<string, ReassignedRiderSummary[]>();
  for (const jobId of input.failedJobIds) result.set(jobId, []);

  for (const [sourceJobId, meta] of attemptsByJob) {
    const newestByRider = new Map<string, ReassignedJobLink['job']>();
    for (const link of input.links) {
      if (!meta.orderIds.has(link.orderId)) continue;
      if (link.job.id === sourceJobId) continue;
      if (link.job.createdAt < meta.earliest) continue;
      const driver = link.job.driver;
      if (!driver) continue;
      const existing = newestByRider.get(driver.id);
      if (!existing || link.job.createdAt > existing.createdAt) {
        newestByRider.set(driver.id, link.job);
      }
    }

    const riders = [...newestByRider.values()]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((job) => ({
        id: job.driver!.id,
        name: job.driver!.name,
        phone: job.driver!.phone,
        jobId: job.id,
        rideCode: job.rideCode,
        status: job.status,
      }));
    result.set(sourceJobId, riders);
  }

  return result;
}

export async function loadReassignedRidersByFailedJob(
  jobIds: string[],
): Promise<Map<string, ReassignedRiderSummary[]>> {
  const unique = [...new Set(jobIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const attempts = await prisma.deliveryAttempt.findMany({
    where: { jobId: { in: unique }, outcome: 'VEHICLE_FAILURE' },
    select: { jobId: true, orderId: true, createdAt: true },
  });
  const orderIds = [...new Set(attempts.map((attempt) => attempt.orderId))];
  const links =
    orderIds.length === 0
      ? []
      : await prisma.deliveryJobOrder.findMany({
          where: { orderId: { in: orderIds } },
          select: {
            orderId: true,
            job: {
              select: {
                id: true,
                status: true,
                rideCode: true,
                createdAt: true,
                driver: { select: { id: true, name: true, phone: true } },
              },
            },
          },
        });

  return pickReassignedRiders({
    failedJobIds: unique,
    attempts,
    links: links.map((link) => ({
      orderId: link.orderId,
      job: {
        id: link.job.id,
        status: link.job.status,
        rideCode: link.job.rideCode ?? null,
        createdAt: link.job.createdAt,
        driver: link.job.driver
          ? {
              id: link.job.driver.id,
              name: link.job.driver.name,
              phone: link.job.driver.phone ?? null,
            }
          : null,
      },
    })),
  });
}