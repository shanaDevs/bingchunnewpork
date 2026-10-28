export type OrderStatus =
  | 'RECEIVED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export type OrderMode = 'DELIVERY' | 'TAKEAWAY';

/** Status assigned when a customer first places an order */
export const INITIAL_ORDER_STATUS: OrderStatus = 'RECEIVED';

const DELIVERY_FLOW: OrderStatus[] = [
  'RECEIVED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

const TAKEAWAY_FLOW: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED'];

export function statusFlowForMode(orderMode: OrderMode): OrderStatus[] {
  return orderMode === 'DELIVERY' ? DELIVERY_FLOW : TAKEAWAY_FLOW;
}

/** Current status plus forward-only options (and cancel when allowed). */
export function allowedStatusOptions(
  current: OrderStatus,
  orderMode: OrderMode
): OrderStatus[] {
  if (current === 'CANCELLED' || current === 'DELIVERED') {
    return [current];
  }

  const flow = statusFlowForMode(orderMode);
  const idx = flow.indexOf(current);
  if (idx < 0) return [current];

  const options: OrderStatus[] = flow.slice(idx);
  options.push('CANCELLED');
  return options;
}

export function assertValidStatusTransition(
  existing: { status: OrderStatus; orderMode: OrderMode },
  newStatus: OrderStatus
): void {
  if (newStatus === existing.status) {
    throw new Error('Order is already in this status');
  }

  if (existing.status === 'CANCELLED' || existing.status === 'DELIVERED') {
    throw new Error('Cannot change status of a completed order');
  }

  if (newStatus === 'CANCELLED') {
    return;
  }

  const flow = statusFlowForMode(existing.orderMode);
  const currentIdx = flow.indexOf(existing.status);
  const newIdx = flow.indexOf(newStatus);

  if (newIdx < 0) {
    throw new Error('Invalid status for this order type');
  }

  if (newIdx <= currentIdx) {
    throw new Error('Cannot revert order to a previous status');
  }
}
