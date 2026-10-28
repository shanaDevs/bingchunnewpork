import { prisma } from '@bingchun/db';

const LIVE_JOB_STATUSES = ['ASSIGNED', 'QUEUED', 'IN_PROGRESS'] as const;

export function pickLiveTrackingLink<
  T extends { jobId: string; job: { status: string; driverId: string | null; createdAt: Date } },
>(links: T[], failedJobIds: Set<string>): T | null {
  const live = links.filter(
    (link) =>
      (LIVE_JOB_STATUSES as readonly string[]).includes(link.job.status) && Boolean(link.job.driverId),
  );
  const redelivery = live.filter((link) => !failedJobIds.has(link.jobId));
  const pool = redelivery.length > 0 ? redelivery : live;
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => b.job.createdAt.getTime() - a.job.createdAt.getTime())[0] ?? null;
}

export type DeliveryTrackPhase = 'TO_OUTLET' | 'TO_CUSTOMER';

export type LiveDriverLocationPayload = {
  driverId: string;
  jobId: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  speedKph: number | null;
  recordedAt: string;
  orderId?: string;
  orderNumber?: string;
};

export type AssignedDriverPublic = {
  id: string;
  name: string;
  phone: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
  vehicleColor: string | null;
  profilePhotoUrl: string | null;
};

async function jobHasPickedUp(jobId: string, jobStatus?: string | null): Promise<boolean> {
  if (jobStatus === 'IN_PROGRESS' || jobStatus === 'COMPLETED') return true;
  const event = await prisma.deliveryEvent.findFirst({
    where: { jobId, state: { in: ['PICKED_UP', 'EN_ROUTE'] } },
    select: { id: true },
  });
  return !!event;
}

async function getAssignedDriverPublic(driverId: string): Promise<AssignedDriverPublic | null> {
  const driver = await prisma.adminUser.findUnique({
    where: { id: driverId },
    select: {
      id: true,
      name: true,
      phone: true,
      vehicleType: true,
      vehicleNumber: true,
      vehicleColor: true,
      profilePhotoUrl: true,
    },
  });
  if (!driver) return null;
  return {
    id: driver.id,
    name: driver.name,
    phone: driver.phone ?? null,
    vehicleType: driver.vehicleType ?? null,
    vehicleNumber: driver.vehicleNumber ?? null,
    vehicleColor: driver.vehicleColor ?? null,
    profilePhotoUrl: driver.profilePhotoUrl ?? null,
  };
}

export async function getLiveTrackingForOrder(orderId: string) {
  const links = await prisma.deliveryJobOrder.findMany({
    where: {
      orderId,
      job: { status: { in: [...LIVE_JOB_STATUSES] } },
    },
    select: {
      jobId: true,
      order: { select: { id: true, orderNumber: true } },
      job: { select: { driverId: true, status: true, createdAt: true } },
    },
  });

  const failedAttempts =
    links.length === 0
      ? []
      : await prisma.deliveryAttempt.findMany({
          where: {
            orderId,
            jobId: { in: links.map((l) => l.jobId) },
            outcome: { not: 'DELIVERED' },
          },
          select: { jobId: true },
          distinct: ['jobId'],
        });
  const failedJobIds = new Set(failedAttempts.map((a) => a.jobId));
  const link = pickLiveTrackingLink(links, failedJobIds);
  if (!link?.job.driverId) return null;

  const pickedUp = await jobHasPickedUp(link.jobId, link.job.status);
  const pickupEvent = pickedUp
    ? await prisma.deliveryEvent.findFirst({
        where: { jobId: link.jobId, orderId, state: { in: ['PICKED_UP', 'EN_ROUTE'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      })
    : null;

  const [loc, driver] = await Promise.all([
    prisma.driverLocation.findFirst({
      where: { driverId: link.job.driverId },
      orderBy: { recordedAt: 'desc' },
      select: {
        driverId: true,
        jobId: true,
        lat: true,
        lng: true,
        heading: true,
        speedKph: true,
        recordedAt: true,
      },
    }),
    getAssignedDriverPublic(link.job.driverId),
  ]);

  return {
    pickedUp,
    pickedUpAt: pickupEvent?.createdAt.toISOString() ?? null,
    phase: pickedUp || link.job.status === 'IN_PROGRESS' ? 'TO_CUSTOMER' : 'TO_OUTLET',
    driver,
    location: loc
      ? {
          driverId: loc.driverId,
          jobId: loc.jobId ?? link.jobId,
          lat: loc.lat,
          lng: loc.lng,
          heading: loc.heading ?? null,
          speedKph: loc.speedKph ?? null,
          recordedAt: loc.recordedAt.toISOString(),
          orderId: link.order.id,
          orderNumber: link.order.orderNumber,
        }
      : null,
  };
}
