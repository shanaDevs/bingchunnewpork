import { prisma } from '@bingchun/db';
import { loadReassignedRidersByFailedJob } from './reassignedRiders';
import { fetchRoadRoute } from './roadRouting';
import { haversineKm } from './geo';

export type JobHandoverStage = 'finding_rider' | 'handover' | 'done';

export type JobHandoverTimelineEvent = {
  at: string;
  kind: string;
  label: string;
};

export type JobHandoverOrder = {
  orderId: string;
  orderNumber: string;
  sequence: number;
  status: string;
  cupCount: number;
};

export type JobHandoverReplacement = {
  driverId: string;
  jobId: string;
  rideCode: string | null;
  jobStatus: string;
  name: string;
  phone: string | null;
  profilePhotoUrl: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
  averageRating: number | null;
  accepted: boolean;
  collected: boolean;
  location: {
    lat: number;
    lng: number;
    heading: number | null;
    recordedAt: string;
  } | null;
  distanceKm: number | null;
  etaMinutes: number | null;
};

export type JobHandoverResponse = {
  jobId: string;
  rideCode: string | null;
  stage: JobHandoverStage;
  breakdownSpot: { lat: number; lng: number } | null;
  replacement: JobHandoverReplacement | null;
  orders: JobHandoverOrder[];
  events: JobHandoverTimelineEvent[];
};

export class JobHandoverError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function replacementJobPickedUp(jobId: string, jobStatus: string | null): Promise<boolean> {
  if (jobStatus === 'IN_PROGRESS' || jobStatus === 'COMPLETED') return true;
  const event = await prisma.deliveryEvent.findFirst({
    where: { jobId, state: { in: ['PICKED_UP', 'EN_ROUTE'] } },
    select: { id: true },
  });
  return event != null;
}

async function replacementJobAccepted(jobId: string, jobStatus: string | null): Promise<boolean> {
  if (
    jobStatus === 'ASSIGNED' ||
    jobStatus === 'QUEUED' ||
    jobStatus === 'IN_PROGRESS' ||
    jobStatus === 'RETURNING' ||
    jobStatus === 'COMPLETED'
  ) {
    return true;
  }
  const event = await prisma.deliveryEvent.findFirst({
    where: { jobId, state: 'ASSIGNED' },
    select: { id: true },
  });
  return event != null;
}

function applyReplacementPrivacy(
  replacement: JobHandoverReplacement,
  collected: boolean,
): JobHandoverReplacement {
  if (!collected) return replacement;
  return {
    ...replacement,
    phone: null,
    location: null,
    distanceKm: null,
    etaMinutes: null,
  };
}

function deriveStage(replacement: JobHandoverReplacement | null, collected: boolean): JobHandoverStage {
  if (!replacement) return 'finding_rider';
  if (collected) return 'done';
  return 'handover';
}

export async function buildJobHandoverResponse(
  jobId: string,
  driverId: string,
): Promise<JobHandoverResponse> {
  const job = await prisma.deliveryJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      driverId: true,
      status: true,
      rideCode: true,
      completedAt: true,
      completedLat: true,
      completedLng: true,
      jobOrders: {
        orderBy: { sequence: 'asc' },
        select: {
          sequence: true,
          orderId: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              items: { select: { quantity: true } },
            },
          },
        },
      },
    },
  });

  if (!job) throw new JobHandoverError('Job not found', 404);
  if (job.driverId !== driverId) throw new JobHandoverError('Job assigned to another driver', 403);
  if (job.status !== 'VEHICLE_FAILURE') {
    throw new JobHandoverError('Handover is only available for vehicle-failure rides', 400);
  }

  const breakdownSpot =
    job.completedLat != null && job.completedLng != null
      ? { lat: job.completedLat, lng: job.completedLng }
      : null;

  const vfAttempts = await prisma.deliveryAttempt.findMany({
    where: { jobId: job.id, outcome: 'VEHICLE_FAILURE' },
    select: { orderId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const handedOrderIds = new Set(vfAttempts.map((a) => a.orderId));

  const orders: JobHandoverOrder[] = job.jobOrders
    .filter((jo) => handedOrderIds.has(jo.orderId))
    .map((jo) => ({
      orderId: jo.order.id,
      orderNumber: jo.order.orderNumber,
      sequence: jo.sequence,
      status: jo.order.status,
      cupCount: jo.order.items.reduce((n, i) => n + i.quantity, 0),
    }));

  const reassigned = (await loadReassignedRidersByFailedJob([job.id])).get(job.id) ?? [];
  const primary = reassigned[reassigned.length - 1] ?? null;

  let replacement: JobHandoverReplacement | null = null;
  let collected = false;

  if (primary) {
    const [driver, ratingAgg, loc, accepted, pickedUp] = await Promise.all([
      prisma.adminUser.findUnique({
        where: { id: primary.id },
        select: {
          id: true,
          name: true,
          phone: true,
          profilePhotoUrl: true,
          vehicleType: true,
          vehicleNumber: true,
        },
      }),
      prisma.riderRating.aggregate({
        where: { driverId: primary.id },
        _avg: { stars: true },
        _count: { stars: true },
      }),
      prisma.driverLocation.findFirst({
        where: { driverId: primary.id },
        orderBy: { recordedAt: 'desc' },
        select: { lat: true, lng: true, heading: true, recordedAt: true },
      }),
      replacementJobAccepted(primary.jobId, primary.status),
      replacementJobPickedUp(primary.jobId, primary.status),
    ]);

    collected = pickedUp;

    let distanceKm: number | null = null;
    let etaMinutes: number | null = null;

    if (!collected && breakdownSpot && loc) {
      try {
        const route = await fetchRoadRoute([
          { lat: loc.lat, lng: loc.lng },
          { lat: breakdownSpot.lat, lng: breakdownSpot.lng },
        ]);
        distanceKm = route.distanceKm;
        etaMinutes = route.durationMinutes;
      } catch {
        distanceKm = Math.round(haversineKm(loc.lat, loc.lng, breakdownSpot.lat, breakdownSpot.lng) * 10) / 10;
        etaMinutes = Math.max(1, Math.round((distanceKm / 25) * 60));
      }
    }

    const ratingCount = ratingAgg._count.stars;
    replacement = {
      driverId: primary.id,
      jobId: primary.jobId,
      rideCode: primary.rideCode,
      jobStatus: primary.status,
      name: driver?.name ?? primary.name,
      phone: driver?.phone ?? primary.phone,
      profilePhotoUrl: driver?.profilePhotoUrl ?? null,
      vehicleType: driver?.vehicleType ?? null,
      vehicleNumber: driver?.vehicleNumber ?? null,
      averageRating:
        ratingCount > 0 && ratingAgg._avg.stars != null
          ? Math.round(ratingAgg._avg.stars * 10) / 10
          : null,
      accepted,
      collected,
      location: loc
        ? {
            lat: loc.lat,
            lng: loc.lng,
            heading: loc.heading ?? null,
            recordedAt: loc.recordedAt.toISOString(),
          }
        : null,
      distanceKm,
      etaMinutes,
    };
    replacement = applyReplacementPrivacy(replacement, collected);
  }

  const stage = deriveStage(replacement, collected);

  const events: JobHandoverTimelineEvent[] = [];
  if (job.completedAt) {
    events.push({
      at: job.completedAt.toISOString(),
      kind: 'breakdown_reported',
      label: 'Vehicle breakdown reported',
    });
  }
  if (primary) {
    const [assignEvent, pickupEvent, createdJob] = await Promise.all([
      prisma.deliveryEvent.findFirst({
        where: { jobId: primary.jobId, state: 'ASSIGNED' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.deliveryEvent.findFirst({
        where: { jobId: primary.jobId, state: { in: ['PICKED_UP', 'EN_ROUTE'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.deliveryJob.findUnique({
        where: { id: primary.jobId },
        select: { createdAt: true, assignedAt: true },
      }),
    ]);
    const assignedAt = assignEvent?.createdAt ?? createdJob?.assignedAt ?? createdJob?.createdAt;
    if (assignedAt) {
      events.push({
        at: assignedAt.toISOString(),
        kind: 'rider_assigned',
        label: 'Replacement rider assigned',
      });
    }
    if (pickupEvent) {
      events.push({
        at: pickupEvent.createdAt.toISOString(),
        kind: 'orders_collected',
        label: 'Orders collected from breakdown spot',
      });
    }
  }

  events.sort((a, b) => a.at.localeCompare(b.at));

  return {
    jobId: job.id,
    rideCode: job.rideCode ?? null,
    stage,
    breakdownSpot,
    replacement,
    orders,
    events,
  };
}