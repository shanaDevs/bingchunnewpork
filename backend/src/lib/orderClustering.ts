import { bearingDeg, type LatLng } from './routeOptimizer';

export const DEFAULT_MAX_CUPS_PER_RIDER = 20;
export const DIRECTIONAL_CUP_THRESHOLD = 10;

/** @deprecated Use DEFAULT_MAX_CUPS_PER_RIDER — kept for backward compatibility */
export const DEFAULT_ORDERS_PER_DELIVERY = DEFAULT_MAX_CUPS_PER_RIDER;

export type ClusterableOrder = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  addressLine: string;
  city: string;
  district: string;
  total: number;
  itemCount: number;
  imageUrl?: string | null;
  extraItemCount?: number;
  paymentStatus: string;
  paymentMethod: string;
  lat: number;
  lng: number;
};

export type OrderCluster = {
  id: string;
  label: string;
  orderIds: string[];
  orders: ClusterableOrder[];
  centroid: LatLng;
};

const COMPASS_LABELS = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'] as const;

function computeCentroid(orders: ClusterableOrder[]): LatLng {
  return {
    lat: orders.reduce((s, o) => s + o.lat, 0) / orders.length,
    lng: orders.reduce((s, o) => s + o.lng, 0) / orders.length,
  };
}

/** Map a bearing (0–360) to an 8-point compass label. */
export function compassLabel(bearing: number): string {
  const normalized = ((bearing % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return COMPASS_LABELS[index];
}

function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

/** True when bearing falls in the half-open semicircle [axis, axis + 180). */
function inSemicircle(bearing: number, axis: number): boolean {
  const b = normalizeBearing(bearing);
  const start = normalizeBearing(axis);
  const end = normalizeBearing(start + 180);
  if (start < end) return b >= start && b < end;
  return b >= start || b < end;
}

function meanBearing(bearings: number[]): number {
  if (bearings.length === 0) return 0;
  const sinSum = bearings.reduce((s, b) => s + Math.sin((b * Math.PI) / 180), 0);
  const cosSum = bearings.reduce((s, b) => s + Math.cos((b * Math.PI) / 180), 0);
  return normalizeBearing((Math.atan2(sinSum, cosSum) * 180) / Math.PI);
}

/** Pick the axis that best balances order counts across two opposite 180° halves. */
function findBalancedAxis(bearings: number[]): number {
  if (bearings.length === 0) return 0;
  let bestAxis = bearings[0];
  let bestDiff = Infinity;
  const n = bearings.length;

  for (const candidate of bearings) {
    const countA = bearings.filter((b) => inSemicircle(b, candidate)).length;
    const diff = Math.abs(countA - n / 2);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestAxis = candidate;
    }
  }

  return bestAxis;
}

function splitByDirection(
  orders: ClusterableOrder[],
  origin: LatLng
): [ClusterableOrder[], ClusterableOrder[]] {
  const withBearing = orders.map((o) => ({
    order: o,
    bearing: bearingDeg(origin, { lat: o.lat, lng: o.lng }),
  }));

  const bearings = withBearing.map((w) => w.bearing);
  const axis = findBalancedAxis(bearings);

  const groupA: ClusterableOrder[] = [];
  const groupB: ClusterableOrder[] = [];

  for (const { order, bearing } of withBearing) {
    if (inSemicircle(bearing, axis)) groupA.push(order);
    else groupB.push(order);
  }

  return [groupA, groupB];
}

/** Greedy FIFO batching by cup count (orders are never split). */
export function clusterOrdersByCups(
  orders: ClusterableOrder[],
  maxCups = DEFAULT_MAX_CUPS_PER_RIDER
): OrderCluster[] {
  if (orders.length === 0) return [];

  const cap = Math.max(1, maxCups);
  const batches: ClusterableOrder[][] = [];
  let current: ClusterableOrder[] = [];
  let cups = 0;

  for (const o of orders) {
    if (current.length > 0 && cups + o.itemCount > cap) {
      batches.push(current);
      current = [];
      cups = 0;
    }
    current.push(o);
    cups += o.itemCount;
  }

  if (current.length) batches.push(current);

  return batches.map((batchOrders, i) => ({
    id: `batch-${i + 1}`,
    label: `Delivery run ${i + 1}`,
    orderIds: batchOrders.map((o) => o.orderId),
    orders: batchOrders,
    centroid: computeCentroid(batchOrders),
  }));
}

function relabelDirectionalBatches(
  halfOrders: ClusterableOrder[],
  origin: LatLng,
  directionSlug: string,
  maxCupsPerRider: number
): OrderCluster[] {
  if (halfOrders.length === 0) return [];

  const bearings = halfOrders.map((o) => bearingDeg(origin, { lat: o.lat, lng: o.lng }));
  const direction = compassLabel(meanBearing(bearings));
  const batches = clusterOrdersByCups(halfOrders, maxCupsPerRider);

  return batches.map((batch, i) => {
    return {
      ...batch,
      id: `${directionSlug}-${i + 1}`,
      label: batches.length > 1 ? `${direction} run ${i + 1}` : direction,
    };
  });
}

/** Split orders into fixed-size delivery runs by order count (FIFO order preserved). */
export function clusterOrdersByBatch(
  orders: ClusterableOrder[],
  ordersPerDelivery = DEFAULT_ORDERS_PER_DELIVERY
): OrderCluster[] {
  if (orders.length === 0) return [];

  const batchSize = Math.max(1, Math.min(ordersPerDelivery, 50));
  const batches: OrderCluster[] = [];

  for (let i = 0; i < orders.length; i += batchSize) {
    const batchOrders = orders.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const centroid = computeCentroid(batchOrders);

    batches.push({
      id: `batch-${batchIndex}`,
      label: `Delivery run ${batchIndex} (${batchOrders.length} order${batchOrders.length === 1 ? '' : 's'})`,
      orderIds: batchOrders.map((o) => o.orderId),
      orders: batchOrders,
      centroid,
    });
  }

  return batches;
}

/**
 * Classify orders by cup threshold and direction.
 * Under 10 cups: single manual cluster. 10+ cups: split into opposite directional halves.
 */
export function clusterOrdersByDirection(
  orders: ClusterableOrder[],
  origin: LatLng,
  maxCupsPerRider = DEFAULT_MAX_CUPS_PER_RIDER
): OrderCluster[] {
  if (orders.length === 0) return [];

  const totalCups = orders.reduce((n, o) => n + o.itemCount, 0);

  if (totalCups < DIRECTIONAL_CUP_THRESHOLD) {
    return [
      {
        id: 'manual',
        label: 'All deliveries (manual)',
        orderIds: orders.map((o) => o.orderId),
        orders,
        centroid: computeCentroid(orders),
      },
    ];
  }

  const [halfA, halfB] = splitByDirection(orders, origin);
  return [
    ...relabelDirectionalBatches(halfA, origin, 'half-a', maxCupsPerRider),
    ...relabelDirectionalBatches(halfB, origin, 'half-b', maxCupsPerRider),
  ];
}
