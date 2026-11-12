import type { Order, OrderStatus } from '@/types';
import { getStatusLabel } from '@/lib/orderStatus';
import { formatMoneyAmount } from '@/lib/receipt';
import { cancellationReasonLabel, OTHER_CANCEL_REASON_VALUE } from '@/lib/cancellationReasons';

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

export type OrderRejectReasonInput = {
  status?: string | null;
  cancelReason?: string | null;
  cancelledBy?: string | null;
  cancellationNote?: string | null;
  paymentStatus?: string | null;
  refundCancellationReason?: string | null;
  refundCustomReasonText?: string | null;
};

function refundRejectReason(params: OrderRejectReasonInput): string | null {
  const custom = params.refundCustomReasonText?.trim();
  if (params.refundCancellationReason === OTHER_CANCEL_REASON_VALUE && custom) return custom;
  if (custom && !params.refundCancellationReason) return custom;
  if (!params.refundCancellationReason) return null;
  return cancellationReasonLabel(params.refundCancellationReason);
}

/** Pull a staff/customer reject reason out of the CANCELLED status-event note. */
export function parseReasonFromCancelNote(note?: string | null): string | null {
  const trimmed = note?.trim() ?? '';
  if (!trimmed) return null;
  const tagged = trimmed.match(/\|\s*Reason:\s*(.+)$/i) ?? trimmed.match(/(?:^|\.\s+)Reason:\s*(.+)$/i);
  if (tagged?.[1]?.trim()) return tagged[1].trim();
  if (/^cancelled by customer\b/i.test(trimmed) && /refund/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * Reject-reason cell for cancelled-order tables.
 * Prefers the customer-selected / staff-typed reason over the generic admin category.
 */
export function resolveOrderRejectReason(params: OrderRejectReasonInput): string {
  const fromNote = parseReasonFromCancelNote(params.cancellationNote);
  if (fromNote) return fromNote;

  const cancelledByCustomer = (params.cancelledBy ?? '').trim().toLowerCase() === 'customer';
  const fromRefund = refundRejectReason(params);
  if (cancelledByCustomer && fromRefund) return fromRefund;

  if (params.cancelReason) {
    return ORDER_CANCEL_REASON_LABELS[params.cancelReason] ?? params.cancelReason;
  }
  if (fromRefund) return fromRefund;
  if (params.paymentStatus === 'REFUNDED') return 'Refunded';
  return '—';
}

/** Human-readable cancellation summary for admin order lists. */
export function formatOrderCancellationReason(params: OrderRejectReasonInput & { status: string }): string | null {
  if (params.status !== 'CANCELLED') return null;
  const reason = resolveOrderRejectReason(params);
  if (reason !== '—') return reason;
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

const SELF_CANCEL_SESSION_PREFIX = 'bc-self-cancel:';

/** Skip duplicate cancel toasts when the customer just cancelled in-app. */
export function markSelfCancelledOrder(orderNumber: string): void {
  if (typeof window === 'undefined') return;
  const key = orderNumber?.trim();
  if (!key) return;
  try {
    sessionStorage.setItem(`${SELF_CANCEL_SESSION_PREFIX}${key}`, '1');
  } catch {
    /* storage unavailable */
  }
}

export function consumeSelfCancelledOrder(orderNumber: string): boolean {
  if (typeof window === 'undefined') return false;
  const key = orderNumber?.trim();
  if (!key) return false;
  try {
    const storageKey = `${SELF_CANCEL_SESSION_PREFIX}${key}`;
    if (!sessionStorage.getItem(storageKey)) return false;
    sessionStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}
