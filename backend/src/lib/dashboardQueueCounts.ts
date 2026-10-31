import type { OrderStatus, Prisma } from '@prisma/client';
import { fulfillmentQueuePaymentWhere } from './orderPayment';

/**
 * Statuses on the branch orders page queue tabs (Received, Preparing, Ready).
 * Out for delivery, delivered, and cancelled are excluded there.
 */
export const ORDER_QUEUE_STATUSES: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY'];

const WAITING_RECEIVED_MS = 30 * 60 * 1000;

type DateRange = { gte: Date; lte: Date };
type StoreScope = { storeId?: string };

/** Same payment visibility as the pickup and delivery queues on the orders page. */
function queueVisibilityOr(): Prisma.OrderWhereInput[] {
  return [
    { orderMode: 'TAKEAWAY', ...fulfillmentQueuePaymentWhere('pickup') },
    { orderMode: 'DELIVERY', ...fulfillmentQueuePaymentWhere('delivery') },
  ];
}

/** Orders the branch orders page shows as still in the queue for this period. */
export function inProgressOrdersWhere(
  scope: StoreScope,
  selectedRange: DateRange,
  options?: { pickupOnly?: boolean },
): Prisma.OrderWhereInput {
  return {
    ...scope,
    createdAt: { gte: selectedRange.gte, lte: selectedRange.lte },
    status: { in: ORDER_QUEUE_STATUSES },
    OR: options?.pickupOnly
      ? [{ orderMode: 'TAKEAWAY', ...fulfillmentQueuePaymentWhere('pickup') }]
      : queueVisibilityOr(),
  };
}

/**
 * Created-at window for "Waiting 30+ min (received)".
 * Only orders inside the selected period that are already 30 minutes old.
 * Returns null when nothing in the period can be that old yet.
 */
export function waitingReceivedCreatedAt(
  selectedRange: DateRange,
  now: Date,
  waitMs = WAITING_RECEIVED_MS,
): { gte: Date; lt: Date } | { gte: Date; lte: Date } | null {
  const olderThan = new Date(now.getTime() - waitMs);
  if (olderThan.getTime() <= selectedRange.gte.getTime()) return null;
  if (olderThan.getTime() < selectedRange.lte.getTime()) {
    return { gte: selectedRange.gte, lt: olderThan };
  }
  return { gte: selectedRange.gte, lte: selectedRange.lte };
}

/** Received orders still waiting, using the same queue visibility as the orders page. */
export function waitingReceivedOrdersWhere(
  scope: StoreScope,
  selectedRange: DateRange,
  now: Date,
): Prisma.OrderWhereInput | null {
  const createdAt = waitingReceivedCreatedAt(selectedRange, now);
  if (!createdAt) return null;
  return {
    ...scope,
    createdAt,
    status: 'RECEIVED',
    OR: queueVisibilityOr(),
  };
}
