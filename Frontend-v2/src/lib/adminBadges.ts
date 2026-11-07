import type { Order } from '@/types';
import { isOrderPaid } from '@/lib/receipt';

export type AdminBadgeVariant =
  | 'blue'
  | 'green'
  | 'yellow'
  | 'red'
  | 'orange'
  | 'purple'
  | 'teal'
  | 'amber'
  | 'indigo'
  | 'neutral';

export function adminBadgeClass(variant: AdminBadgeVariant, size: 'sm' | 'md' = 'sm'): string {
  const sizeClass = size === 'md' ? 'admin-status-badge--md' : '';
  return ['admin-status-badge', `admin-status-badge--${variant}`, sizeClass].filter(Boolean).join(' ');
}

export const ORDER_STATUS_BADGE: Record<string, AdminBadgeVariant> = {
  RECEIVED: 'blue',
  PREPARING: 'yellow',
  READY: 'green',
  OUT_FOR_DELIVERY: 'orange',
  DELIVERED: 'teal',
  CANCELLED: 'red',
};

export const DELIVERY_JOB_STATUS_BADGE: Record<string, AdminBadgeVariant> = {
  SCHEDULED: 'blue',
  ASSIGNED: 'yellow',
  QUEUED: 'purple',
  IN_PROGRESS: 'orange',
  RETURNING: 'orange',
  COMPLETED: 'green',
  CANCELLED: 'red',
  VEHICLE_FAILURE: 'red',
  MISSED: 'neutral',
  ABANDONED: 'red',
  PARTIALLY_COMPLETED: 'amber',
};

export const DELIVERY_JOB_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  ASSIGNED: 'Assigned',
  QUEUED: 'Queued',
  IN_PROGRESS: 'In progress',
  RETURNING: 'Returning',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  VEHICLE_FAILURE: 'Vehicle failure',
  MISSED: 'Missed',
  ABANDONED: 'Abandoned',
  PARTIALLY_COMPLETED: 'Partially Completed',
};

export const ORDER_MODE_BADGE: Record<string, AdminBadgeVariant> = {
  DELIVERY: 'orange',
  TAKEAWAY: 'blue',
};

export const PAYMENT_METHOD_BADGE: Record<string, AdminBadgeVariant> = {
  CARD: 'indigo',
  PAYHERE: 'purple',
  CASH_AT_COUNTER: 'teal',
  LOYALTY_POINTS: 'amber',
};

export function paymentStatusBadgeVariant(order: Pick<Order, 'paymentStatus' | 'paymentMethod'>): AdminBadgeVariant {
  if (isOrderPaid(order)) return 'green';
  if (order.paymentStatus === 'FAILED') return 'red';
  return 'yellow';
}
