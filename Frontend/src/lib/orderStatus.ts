import { CheckCircle, Package, Star, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { OrderStatus, OrderStatusEvent } from '@/types';

export const ORDER_STATUSES: OrderStatus[] = [
  'RECEIVED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  RECEIVED: 'Order Received',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  RECEIVED: 'text-blue-400',
  PREPARING: 'text-yellow-400',
  READY: 'text-green-400',
  OUT_FOR_DELIVERY: 'text-orange-400',
  DELIVERED: 'text-green-400',
  CANCELLED: 'text-red-400',
};

/** UI tracking steps may include synthetic Pickup between Ready and Out for Delivery. */
export type TrackingStepStatus = OrderStatus | 'PICKUP';

export interface TrackingStep {
  status: TrackingStepStatus;
  label: string;
  icon: LucideIcon;
  desc: string;
}

export type DeliveryTrackPhase = 'TO_OUTLET' | 'TO_CUSTOMER';

/** Full delivery flow — includes Pickup while rider collects from the store */
export const DELIVERY_STEPS: TrackingStep[] = [
  { status: 'RECEIVED', label: 'Order Received', icon: CheckCircle, desc: 'We got your order!' },
  { status: 'PREPARING', label: 'Preparing', icon: Package, desc: 'Crafting your drinks with love' },
  { status: 'READY', label: 'Order Ready', icon: CheckCircle, desc: 'Packed and ready to go' },
  { status: 'PICKUP', label: 'Pickup', icon: Truck, desc: 'Rider collecting from the store' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: Package, desc: 'On the way to you' },
  { status: 'DELIVERED', label: 'Delivered', icon: Star, desc: 'Enjoy your order!' },
];

/** Takeaway flow — ends at ready for pickup */
export const TAKEAWAY_STEPS: TrackingStep[] = [
  { status: 'RECEIVED', label: 'Order Received', icon: CheckCircle, desc: 'We got your order!' },
  { status: 'PREPARING', label: 'Preparing', icon: Package, desc: 'Crafting your drinks with love' },
  { status: 'READY', label: 'Ready for Pickup', icon: Star, desc: 'Come collect your order!' },
];

const GLOBAL_STATUS_ORDER: OrderStatus[] = [
  'RECEIVED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export function getTrackingSteps(isDelivery: boolean): TrackingStep[] {
  return isDelivery ? DELIVERY_STEPS : TAKEAWAY_STEPS;
}

export function getTrackingStepIndex(
  steps: TrackingStep[],
  status: OrderStatus,
  opts?: {
    deliveryPhase?: DeliveryTrackPhase | null;
    deliveryPickedUp?: boolean;
    hasAssignedDriver?: boolean;
  },
): number {
  if (status === 'CANCELLED') return -1;

  const pickupIdx = steps.findIndex((s) => s.status === 'PICKUP');
  if (pickupIdx >= 0) {
    if (status === 'DELIVERED') {
      return steps.findIndex((s) => s.status === 'DELIVERED');
    }
    if (status === 'OUT_FOR_DELIVERY') {
      return steps.findIndex((s) => s.status === 'OUT_FOR_DELIVERY');
    }
    if (status === 'READY') {
      const headingToStore =
        opts?.deliveryPhase === 'TO_OUTLET' ||
        opts?.deliveryPickedUp === true ||
        opts?.hasAssignedDriver === true;
      if (headingToStore) return pickupIdx;
      return steps.findIndex((s) => s.status === 'READY');
    }
  }

  const direct = steps.findIndex((s) => s.status === status);
  if (direct >= 0) return direct;

  const globalIdx = GLOBAL_STATUS_ORDER.indexOf(status);
  if (globalIdx < 0) return 0;

  for (let i = steps.length - 1; i >= 0; i--) {
    const stepStatus = steps[i].status;
    if (stepStatus === 'PICKUP') continue;
    const stepIdx = GLOBAL_STATUS_ORDER.indexOf(stepStatus);
    if (stepIdx >= 0 && stepIdx <= globalIdx) return i;
  }

  return 0;
}

export function isTrackingComplete(status: OrderStatus, isDelivery: boolean): boolean {
  if (status === 'CANCELLED') return false;
  return isDelivery ? status === 'DELIVERED' : status === 'READY' || status === 'DELIVERED';
}

/** True when status just reached the final happy state for this order mode */
export function isNewCompletionStatus(
  newStatus: OrderStatus,
  prevStatus: OrderStatus,
  isDelivery: boolean,
): boolean {
  if (newStatus === prevStatus || newStatus === 'CANCELLED') return false;
  return isDelivery ? newStatus === 'DELIVERED' : newStatus === 'READY';
}

export function getStatusLabel(status: OrderStatus, orderMode?: 'DELIVERY' | 'TAKEAWAY'): string {
  if (status === 'READY' && orderMode === 'TAKEAWAY') return 'Ready for Pickup';
  if (status === 'READY' && orderMode === 'DELIVERY') return 'Order Ready';
  if (status === 'DELIVERED' && orderMode === 'TAKEAWAY') return 'Collected';
  return STATUS_LABELS[status];
}

const RECEIVED_MERGE_WINDOW_MS = 60_000;

/** Map each order status to the first time it was recorded. */
export function buildStatusTimestampMap(
  statusEvents: OrderStatusEvent[] | undefined,
  orderCreatedAt: string,
): Partial<Record<OrderStatus, string>> {
  const map: Partial<Record<OrderStatus, string>> = {};
  const sorted = [...(statusEvents ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const event of sorted) {
    if (!map[event.status]) {
      map[event.status] = event.createdAt;
    }
  }

  const receivedAt = map.RECEIVED;
  if (!receivedAt) {
    map.RECEIVED = orderCreatedAt;
  } else if (
    Math.abs(new Date(receivedAt).getTime() - new Date(orderCreatedAt).getTime()) <=
    RECEIVED_MERGE_WINDOW_MS
  ) {
    map.RECEIVED = orderCreatedAt;
  }

  return map;
}

const TAKEAWAY_FLOW: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED'];

export function allowedStatusOptions(
  current: OrderStatus,
  orderMode: 'DELIVERY' | 'TAKEAWAY',
): OrderStatus[] {
  if (current === 'CANCELLED' || current === 'DELIVERED') {
    return [current];
  }

  const flow = orderMode === 'DELIVERY' ? ORDER_STATUSES.filter((s) => s !== 'CANCELLED') : TAKEAWAY_FLOW;
  const idx = flow.indexOf(current);
  if (idx < 0) return [current];

  const options: OrderStatus[] = flow.slice(idx);
  options.push('CANCELLED');
  return options;
}
