import { prisma } from '@bingchun/db';
import { haversineKm } from './geo';

export const DROPOFF_DIVERGE_METERS = 40;

export type DropoffLatLng = { lat: number; lng: number };

export function parseLatLngPair(
  lat?: number | null,
  lng?: number | null,
): DropoffLatLng | null {
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function plannedDeliveryPoint(order: {
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  address?: { lat?: number | null; lng?: number | null } | null;
}): DropoffLatLng | null {
  return parseLatLngPair(order.deliveryLat ?? order.address?.lat, order.deliveryLng ?? order.address?.lng);
}

export function actualDropoffPoint(order: {
  actualDropoffLat?: number | null;
  actualDropoffLng?: number | null;
}): DropoffLatLng | null {
  return parseLatLngPair(order.actualDropoffLat, order.actualDropoffLng);
}

/** Pin for a delivered stop: rider GPS when present, otherwise the checkout address. */
export function mapPinPoint(order: {
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  actualDropoffLat?: number | null;
  actualDropoffLng?: number | null;
  address?: { lat?: number | null; lng?: number | null } | null;
}): DropoffLatLng | null {
  return actualDropoffPoint(order) ?? plannedDeliveryPoint(order);
}

export function dropoffApiFields(order: {
  actualDropoffLat?: number | null;
  actualDropoffLng?: number | null;
  actualDropoffAt?: Date | string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  address?: { lat?: number | null; lng?: number | null } | null;
}): {
  dropoffLat: number | null;
  dropoffLng: number | null;
  dropoffAt: Date | string | null;
  plannedLat: number | null;
  plannedLng: number | null;
} {
  const planned = plannedDeliveryPoint(order);
  const dropoff = actualDropoffPoint(order);
  return {
    dropoffLat: dropoff?.lat ?? null,
    dropoffLng: dropoff?.lng ?? null,
    dropoffAt: order.actualDropoffAt ?? null,
    plannedLat: planned?.lat ?? null,
    plannedLng: planned?.lng ?? null,
  };
}

export function shouldShowPlannedAddressPin(
  planned: DropoffLatLng | null,
  actual: DropoffLatLng | null,
  divergeMeters = DROPOFF_DIVERGE_METERS,
): boolean {
  if (!planned || !actual) return false;
  return haversineKm(planned.lat, planned.lng, actual.lat, actual.lng) * 1000 >= divergeMeters;
}

export type LiveLastDropoff = {
  kind: 'dropoff';
  sequence: number;
  label: string;
  orderId: string;
  orderNumber: string;
  lat: number;
  lng: number;
  actual: boolean;
};

export function resolveLiveLastDropoff(
  jobOrders: Array<{
    sequence: number;
    order: {
      id: string;
      orderNumber: string;
      status: string;
      deliveryLat?: number | null;
      deliveryLng?: number | null;
      actualDropoffLat?: number | null;
      actualDropoffLng?: number | null;
      actualDropoffAt?: Date | string | null;
      address?: { lat?: number | null; lng?: number | null } | null;
    };
  }>,
): LiveLastDropoff | null {
  const delivered = jobOrders
    .filter((link) => link.order.status === 'DELIVERED')
    .sort((a, b) => {
      const aAt = a.order.actualDropoffAt ? new Date(a.order.actualDropoffAt).getTime() : 0;
      const bAt = b.order.actualDropoffAt ? new Date(b.order.actualDropoffAt).getTime() : 0;
      if (aAt !== bAt) return bAt - aAt;
      return b.sequence - a.sequence;
    });
  const latest = delivered[0];
  if (!latest) return null;
  const pin = mapPinPoint(latest.order);
  if (!pin) return null;
  return {
    kind: 'dropoff',
    sequence: latest.sequence,
    label: `#${latest.sequence}`,
    orderId: latest.order.id,
    orderNumber: latest.order.orderNumber,
    lat: pin.lat,
    lng: pin.lng,
    actual: actualDropoffPoint(latest.order) != null,
  };
}

export async function resolveRiderDropoffCoords(args: {
  lat?: number | null;
  lng?: number | null;
  driverId: string;
  jobId: string;
  orderId?: string;
}): Promise<DropoffLatLng | null> {
  const fromBody = parseLatLngPair(args.lat, args.lng);
  if (fromBody) return fromBody;

  if (args.orderId) {
    const attempt = await prisma.deliveryAttempt.findFirst({
      where: {
        orderId: args.orderId,
        jobId: args.jobId,
        lat: { not: null },
        lng: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { lat: true, lng: true },
    });
    const fromAttempt = parseLatLngPair(attempt?.lat, attempt?.lng);
    if (fromAttempt) return fromAttempt;
  }

  const jobPing = await prisma.driverLocation.findFirst({
    where: { driverId: args.driverId, jobId: args.jobId },
    orderBy: { recordedAt: 'desc' },
    select: { lat: true, lng: true },
  });
  const fromJobPing = parseLatLngPair(jobPing?.lat, jobPing?.lng);
  if (fromJobPing) return fromJobPing;

  const anyPing = await prisma.driverLocation.findFirst({
    where: { driverId: args.driverId },
    orderBy: { recordedAt: 'desc' },
    select: { lat: true, lng: true },
  });
  return parseLatLngPair(anyPing?.lat, anyPing?.lng);
}

export async function recordDeliveredAttempt(args: {
  orderId: string;
  jobId: string;
  driverId: string;
  note?: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<void> {
  const prior = await prisma.deliveryAttempt.count({ where: { orderId: args.orderId, jobId: args.jobId } });
  const coords = parseLatLngPair(args.lat, args.lng);
  await prisma.deliveryAttempt.create({
    data: {
      orderId: args.orderId,
      jobId: args.jobId,
      driverId: args.driverId,
      attemptNo: prior + 1,
      outcome: 'DELIVERED',
      note: args.note ?? 'Delivered',
      lat: coords?.lat,
      lng: coords?.lng,
    },
  });
}

/** Core/order-table write. Delivery-service must not call this (it never writes `orders`). */
export async function persistActualDropoffOnOrder(args: {
  orderId: string;
  lat: number;
  lng: number;
  at?: Date;
}): Promise<DropoffLatLng> {
  const coords = parseLatLngPair(args.lat, args.lng);
  if (!coords) {
    throw new Error('Invalid drop-off coordinates');
  }
  await prisma.order.update({
    where: { id: args.orderId },
    data: {
      actualDropoffLat: coords.lat,
      actualDropoffLng: coords.lng,
      actualDropoffAt: args.at ?? new Date(),
    } as never,
  });
  return coords;
}
