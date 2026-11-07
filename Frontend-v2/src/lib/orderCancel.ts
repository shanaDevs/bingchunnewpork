import type { Order, OrderStatus } from '@/types';
import { getStatusLabel } from '@/lib/orderStatus';
import { formatMoneyAmount } from '@/lib/receipt';

/**
 * Friendly partial-refund phrases by percentage band (fallback when amount is unknown).
 */
export const REFUND_PERCENTAGE_MESSAGE_BUCKETS: Array<{
  min: number;
  max: number;
  message: string;
}> = [
  { min: 90, max: 100, message: 'almost a full refund' },
  { min: 70, max: 89, message: 'most of your payment back' },
  { min: 50, max: 69, message: 'a good portion back' },
  { min: 30, max: 49, message: 'a partial refund' },
  { min: 10, max: 29, message: 'a small partial refund' },
  { min: 0, max: 9, message: 'little or no refund' },
];

export const ORDER_CANCEL_REASON_LABELS: Record<string, string> = {
  OUT_OF_STOCK: 'Item Out of Stock / Unavailable',
  CUSTOMER_REQUEST: 'Customer Requested Cancellation',
  PAYMENT_OR_SYSTEM_ISSUE: 'Payment or System Issue / Duplicate Order',
};

/** Human-readable cancellation summary for admin order lists. */
export function formatOrderCancellationReason(params: {
  status: string;
  cancelReason?: string | null;
  cancelledBy?: string | null;
  cancellationNote?: string | null;
}): string | null {
  if (params.status !== 'CANCELLED') return null;

  const parts: string[] = [];
  if (params.cancelReason) {
    parts.push(ORDER_CANCEL_REASON_LABELS[params.cancelReason] ?? params.cancelReason);
  }
  const note = params.cancellationNote?.trim();
  if (note) parts.push(note);

  if (parts.length > 0) return parts.join(' · ');

  const by = params.cancelledBy?.trim().toLowerCase();
  if (by === 'customer') return 'Customer cancellation';
  if (by) return `Cancelled by ${by}`;
  return null;
}

export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function secondsUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}

export function isCustomerCancelWindowActive(
  order: Pick<Order, 'canCancel' | 'cancelWindowEndsAt' | 'status'>,
  secondsLeft?: number,
): boolean {
  if (order.status !== 'RECEIVED') return false;
  const remaining = secondsLeft ?? secondsUntil(order.cancelWindowEndsAt ?? null);
  return Boolean(order.canCancel && remaining > 0);
}

export function isOnlinePaidOrder(order: Pick<Order, 'paymentMethod' | 'paymentStatus'>): boolean {
  const isOnline = order.paymentMethod === 'PAYHERE' || order.paymentMethod === 'CARD';
  return isOnline && order.paymentStatus === 'PAID';
}

export function getFullRefundCancelNotice(
  cancelWindowMinutes = 10,
  _estimatedRefund?: number | null,
): {
  banner: string;
  confirmLead: string;
  confirmHighlight: string | null;
} {
  const minutesLabel = cancelWindowMinutes === 1 ? '1 minute' : `${cancelWindowMinutes} minutes`;
  return {
    banner: `Full refund if you cancel within ${minutesLabel}.`,
    confirmLead: 'You’ll get a full refund.',
    confirmHighlight: null,
  };
}

export function getPartialRefundMessageForPercentage(
  percentage: number | null | undefined,
): string {
  if (percentage == null || !Number.isFinite(percentage)) {
    return 'partial refund';
  }

  const clamped = Math.max(0, Math.min(100, percentage));
  const bucket = REFUND_PERCENTAGE_MESSAGE_BUCKETS.find(
    (entry) => clamped >= entry.min && clamped <= entry.max,
  );

  return bucket?.message ?? 'partial refund';
}

export function getCancelCardTitle(status: OrderStatus, _isFullTier: boolean): string {
  if (status === 'PREPARING') return 'Preparing your order';
  if (status === 'READY') return 'Your order is ready';
  if (status === 'OUT_FOR_DELIVERY') return 'Out for delivery';
  if (status === 'RECEIVED') return 'Order received';
  return `Order is ${getStatusLabel(status)}`;
}

export function getPartialRefundCancelNotice(input: {
  status?: OrderStatus;
  paymentMethod: Order['paymentMethod'];
  paymentStatus: Order['paymentStatus'];
}): { banner: string; confirmLead: string; confirmHighlight: string | null } | null {
  if (!isOnlinePaidOrder(input)) return null;

  return {
    banner: 'A refund may apply after cancellation.',
    confirmLead: 'A refund may apply after cancellation.',
    confirmHighlight: null,
  };
}

export function getCashCancelNotice(_status: OrderStatus): {
  banner: string;
  confirmLead: string;
  confirmHighlight: string | null;
} {
  return {
    banner: 'Cancellation can’t be undone.',
    confirmLead: 'This can’t be undone.',
    confirmHighlight: null,
  };
}

export function computeSalesTotal(order: Pick<Order, 'subtotal' | 'discount' | 'loyaltyDiscount'>): number {
  return Math.max(0, order.subtotal - order.discount - order.loyaltyDiscount);
}

export function formatRefundAmount(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `LKR ${formatMoneyAmount(amount)}`;
}
