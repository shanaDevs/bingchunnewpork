import { decimalFieldToLkrNumber } from './moneyDecimal';
import { buildJobRoutePreview, type JobPreviewStop } from './deliveryJobHelpers';
import type { DeliveryJobBroadcastPayload } from './socket';
import type { NewJobPushPayload } from './driverPush';

type OfferOrder = {
  id: string;
  orderNumber: string;
  status: string;
  deliveryFee: number;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryAddressLine: string | null;
  deliveryCity: string | null;
  deliveryDistrict: string | null;
  guestName: string | null;
  user: { name: string | null } | null;
  address: {
    lat: number | null;
    lng: number | null;
    addressLine: string;
    city: string;
    district: string;
  } | null;
  items: { quantity: number }[];
};

export type NewJobOrderPreview = {
  orderNumber: string;
  deliveryFee: number;
};

export type NewJobOfferExtras = {
  storeCity: string;
  previewStops: JobPreviewStop[];
  orderPreviews: NewJobOrderPreview[];
};

type JobForOffer = {
  id: string;
  title: string;
  status: string;
  scheduledAt: Date;
  storeId: string;
  rideCode?: string | null;
  totalCups?: number | null;
  estimatedDistanceKm?: number | null;
  estimatedMinutes?: number | null;
  totalDistanceKm?: number | null;
  totalDeliveryFees?: unknown;
  store: { name: string; city: string; lat: number; lng: number };
  jobOrders: { sequence: number; order: OfferOrder }[];
};

function cupsFromOrders(jobOrders: JobForOffer['jobOrders']): number {
  return jobOrders.reduce(
    (sum, jo) => sum + jo.order.items.reduce((n, item) => n + item.quantity, 0),
    0,
  );
}

function feesFromOrders(jobOrders: JobForOffer['jobOrders']): number {
  return jobOrders.reduce((sum, jo) => sum + jo.order.deliveryFee, 0);
}

export function buildNewJobOfferExtras(
  store: JobForOffer['store'],
  jobOrders: JobForOffer['jobOrders'],
): NewJobOfferExtras {
  const orders = jobOrders.map((jo) => jo.order);
  const preview = buildJobRoutePreview(store, orders, false);
  const sorted = [...jobOrders].sort((a, b) => a.sequence - b.sequence);
  const orderPreviews: NewJobOrderPreview[] = sorted.slice(0, 3).map((jo) => ({
    orderNumber: jo.order.orderNumber,
    deliveryFee: jo.order.deliveryFee,
  }));
  return {
    storeCity: store.city,
    previewStops: preview.previewStops,
    orderPreviews,
  };
}

export function buildNewJobBroadcastPayload(
  job: JobForOffer,
  opts: { broadcastedAt?: Date; forceRing?: boolean } = {},
): DeliveryJobBroadcastPayload & NewJobOfferExtras {
  const cups = job.totalCups ?? cupsFromOrders(job.jobOrders);
  const fees =
    job.totalDeliveryFees != null
      ? decimalFieldToLkrNumber(job.totalDeliveryFees as import('@prisma/client').Prisma.Decimal)
      : feesFromOrders(job.jobOrders);
  const extras = buildNewJobOfferExtras(job.store, job.jobOrders);
  const preview = buildJobRoutePreview(job.store, job.jobOrders.map((jo) => jo.order), false);

  return {
    id: job.id,
    rideCode: job.rideCode ?? null,
    title: job.title,
    status: job.status,
    scheduledAt: job.scheduledAt,
    storeId: job.storeId,
    storeName: job.store.name,
    orderCount: job.jobOrders.length,
    totalCups: cups,
    estimatedDistanceKm: job.estimatedDistanceKm ?? job.totalDistanceKm ?? preview.estimatedDistanceKm,
    estimatedMinutes: job.estimatedMinutes ?? preview.estimatedMinutes,
    deliveryFee: fees,
    storeCity: extras.storeCity,
    previewStops: extras.previewStops,
    orderPreviews: extras.orderPreviews,
    ...(opts.broadcastedAt ? { broadcastedAt: opts.broadcastedAt } : {}),
    ...(opts.forceRing ? { forceRing: true } : {}),
  };
}

export function buildNewJobPushFromBroadcast(
  payload: DeliveryJobBroadcastPayload & NewJobOfferExtras,
  opts: { forceRing?: boolean } = {},
): NewJobPushPayload {
  const first = payload.previewStops[0];
  const dropoffAddress = first
    ? [first.addressLine, first.city, first.district].filter(Boolean).join(', ')
    : undefined;
  const forceRing = opts.forceRing ?? payload.forceRing;
  return {
    jobId: payload.id,
    rideCode: payload.rideCode ?? undefined,
    title: payload.title,
    storeName: payload.storeName,
    storeId: payload.storeId,
    orderCount: payload.orderCount,
    totalCups: payload.totalCups ?? undefined,
    estimatedDistanceKm: payload.estimatedDistanceKm ?? undefined,
    estimatedMinutes: payload.estimatedMinutes ?? undefined,
    deliveryFee: payload.deliveryFee ?? undefined,
    storeCity: payload.storeCity,
    dropoffName: first?.customerName,
    dropoffAddress,
    extraStopCount: Math.max(0, payload.orderCount - 1),
    orderPreviewsJson: JSON.stringify(payload.orderPreviews ?? []),
    ...(forceRing ? { forceRing: true } : {}),
  };
}
