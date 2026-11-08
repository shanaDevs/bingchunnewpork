import type { OrderStatus } from '@prisma/client';
import { computeRefundAmountFromPercentage } from './refundPaymentStructure';

export const DEFAULT_CANCEL_WINDOW_MINUTES = 10;
export const CUSTOMER_CANCEL_WINDOW_MS = DEFAULT_CANCEL_WINDOW_MINUTES * 60 * 1000;

export type CancelRefundTier = 'full' | 'partial';

/** Statuses where customers may self-cancel (until delivered). */
const CUSTOMER_CANCELLABLE_STATUSES = new Set([
  'RECEIVED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
]);

export function getCancelWindowMs(cancelWindowMinutes = DEFAULT_CANCEL_WINDOW_MINUTES): number {
  return Math.max(1, cancelWindowMinutes) * 60 * 1000;
}

function isOnlinePaymentMethod(paymentMethod: string): boolean {
  return paymentMethod === 'PAYHERE' || paymentMethod === 'CARD';
}

function isOnlinePaidOrder(paymentMethod: string, paymentStatus: string): boolean {
  return isOnlinePaymentMethod(paymentMethod) && paymentStatus === 'PAID';
}

export function resolveCancelWindowStart(order: {
  createdAt: Date;
  cancelWindowStartsAt?: Date | null;
  paymentMethod: string;
  paymentStatus: string;
}): Date | null {
  if (order.cancelWindowStartsAt) return order.cancelWindowStartsAt;
  if (isOnlinePaymentMethod(order.paymentMethod) && order.paymentStatus !== 'PAID') {
    return null;
  }
  return order.createdAt;
}

export function computeSalesTotal(order: {
  subtotal: number;
  discount: number;
  loyaltyDiscount: number;
}): number {
  return Math.max(0, order.subtotal - order.discount - order.loyaltyDiscount);
}

export function estimateCustomerCancelRefund(
  order: {
    total: number;
    subtotal: number;
    discount: number;
    loyaltyDiscount: number;
    paymentMethod: string;
    paymentStatus: string;
  },
  tier: CancelRefundTier,
  partialRefundPercentage?: number | null,
): number | null {
  if (!isOnlinePaidOrder(order.paymentMethod, order.paymentStatus)) return null;
  if (tier === 'full') return order.total;

  const salesTotal = computeSalesTotal(order);
  if (partialRefundPercentage == null) return salesTotal;
  return computeRefundAmountFromPercentage(salesTotal, partialRefundPercentage);
}

export function getCustomerCancelEligibility(order: {
  status: string;
  createdAt: Date;
  cancelWindowStartsAt?: Date | null;
  paymentMethod?: string;
  paymentStatus?: string;
  now?: Date;
  cancelWindowMinutes?: number;
}): {
  canCancel: boolean;
  cancelWindowEndsAt: string | null;
  cancelRefundTier: CancelRefundTier | null;
  cancelWindowExpired: boolean;
} {
  const now = order.now ?? new Date();
  const cancelWindowMs = getCancelWindowMs(order.cancelWindowMinutes);
  const canCancel = CUSTOMER_CANCELLABLE_STATUSES.has(order.status);

  if (!canCancel) {
    return {
      canCancel: false,
      cancelWindowEndsAt: null,
      cancelRefundTier: null,
      cancelWindowExpired: false,
    };
  }

  const windowStart = resolveCancelWindowStart({
    createdAt: order.createdAt,
    cancelWindowStartsAt: order.cancelWindowStartsAt,
    paymentMethod: order.paymentMethod ?? '',
    paymentStatus: order.paymentStatus ?? '',
  });

  if (!windowStart) {
    return {
      canCancel: true,
      cancelWindowEndsAt: null,
      cancelRefundTier: null,
      cancelWindowExpired: false,
    };
  }

  const cancelEndsAt = new Date(windowStart.getTime() + cancelWindowMs);
  const withinFullRefundWindow = now < cancelEndsAt;
  const cancelWindowExpired = !withinFullRefundWindow;

  return {
    canCancel: true,
    cancelWindowEndsAt: withinFullRefundWindow ? cancelEndsAt.toISOString() : null,
    cancelRefundTier: withinFullRefundWindow ? 'full' : 'partial',
    cancelWindowExpired,
  };
}

export function buildCustomerCancelNote(
  tier: CancelRefundTier,
  order: {
    deliveryFee: number;
    convenientFee: number;
    paymentMethod: string;
    paymentStatus: string;
  },
  partialRefundPercentage?: number | null,
): string {
  if (tier === 'full') {
    return 'Cancelled by customer. Full refund of all paid amount';
  }
  const retained: string[] = [];
  if (order.deliveryFee > 0) retained.push(`delivery fee LKR ${order.deliveryFee}`);
  if (order.convenientFee > 0) retained.push(`convenience fee LKR ${order.convenientFee}`);
  const feeNote = retained.length > 0 ? ` — ${retained.join(' and ')} not refunded` : '';
  const pctNote = partialRefundPercentage != null
    ? `Partial refund: ${partialRefundPercentage}% of sales total`
    : 'Partial refund on sales total only';
  return `Cancelled by customer. ${pctNote}${feeNote}`;
}

export function appendReasonToCancelNote(baseNote: string, reasonLabel?: string | null): string {
  const label = reasonLabel?.trim();
  if (!label) return baseNote;
  if (/\bReason:\s*/i.test(baseNote)) return baseNote;
  return `${baseNote.replace(/\s+$/, '')} | Reason: ${label}`;
}

const ADMIN_CANCEL_REASON_LABELS: Record<string, string> = {
  OUT_OF_STOCK: 'Item Out of Stock / Unavailable',
  CUSTOMER_REQUEST: 'Customer Requested Cancellation',
  PAYMENT_OR_SYSTEM_ISSUE: 'Payment or System Issue / Duplicate Order',
};

const CUSTOMER_CANCEL_REASON_LABELS: Record<string, string> = {
  CHANGED_MIND: 'Changed my mind',
  ORDERED_BY_MISTAKE: 'Ordered by mistake',
  TAKING_TOO_LONG: 'Taking too long',
  FOUND_CHEAPER_ELSEWHERE: 'Found a better price elsewhere',
  PAYMENT_ISSUES: 'Payment issues',
  OTHER: 'Other (please specify)',
};

export function parseReasonFromCancelNote(note?: string | null): string | null {
  const trimmed = note?.trim() ?? '';
  if (!trimmed) return null;
  const tagged = trimmed.match(/\|\s*Reason:\s*(.+)$/i) ?? trimmed.match(/(?:^|\.\s+)Reason:\s*(.+)$/i);
  if (tagged?.[1]?.trim()) return tagged[1].trim();
  if (/^cancelled by customer\b/i.test(trimmed) && /refund/i.test(trimmed)) return null;
  return trimmed;
}

export function resolveStoredRejectReason(input: {
  cancelReason?: string | null;
  cancelledBy?: string | null;
  cancellationNote?: string | null;
  paymentStatus?: string | null;
  status?: string | null;
  refundCancellationReason?: string | null;
  refundCustomReasonText?: string | null;
}): string {
  const fromNote = parseReasonFromCancelNote(input.cancellationNote);
  if (fromNote) return fromNote;

  const cancelledByCustomer = (input.cancelledBy ?? '').trim().toLowerCase() === 'customer';
  const custom = input.refundCustomReasonText?.trim();
  const fromRefund =
    input.refundCancellationReason === 'OTHER' && custom
      ? custom
      : input.refundCancellationReason
        ? CUSTOMER_CANCEL_REASON_LABELS[input.refundCancellationReason]
          ?? input.refundCancellationReason.replace(/_/g, ' ')
        : custom || null;

  if (cancelledByCustomer && fromRefund) return fromRefund;
  if (input.cancelReason) {
    return ADMIN_CANCEL_REASON_LABELS[input.cancelReason] ?? input.cancelReason;
  }
  if (fromRefund) return fromRefund;
  if (input.paymentStatus === 'REFUNDED') return 'Refunded';
  return input.status === 'CANCELLED' ? 'Order cancelled' : '—';
}

export function withCustomerCancelRefundFields<
  T extends {
    total: number;
    subtotal: number;
    discount: number;
    loyaltyDiscount: number;
    deliveryFee: number;
    convenientFee: number;
    paymentMethod: string;
    paymentStatus: string;
    status: string;
    createdAt: Date;
    cancelWindowStartsAt?: Date | null;
  },
>(order: T, cancelWindowMinutes = DEFAULT_CANCEL_WINDOW_MINUTES, partialRefundPercentage?: number | null) {
  const cancelFlags = getCustomerCancelEligibility({
    status: order.status,
    createdAt: order.createdAt,
    cancelWindowStartsAt: order.cancelWindowStartsAt,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    cancelWindowMinutes,
  });

  const estimatedCancelRefund =
    cancelFlags.cancelRefundTier != null
      ? estimateCustomerCancelRefund(order, cancelFlags.cancelRefundTier, partialRefundPercentage)
      : null;

  return {
    canCancel: cancelFlags.canCancel,
    cancelWindowEndsAt: cancelFlags.cancelWindowEndsAt,
    cancelRefundTier: cancelFlags.cancelRefundTier,
    cancelWindowExpired: cancelFlags.cancelWindowExpired,
    cancelWindowMinutes,
    cancelRefundPercentage:
      cancelFlags.cancelRefundTier === 'full'
        ? 100
        : partialRefundPercentage ?? null,
    estimatedCancelRefund,
    salesTotal: computeSalesTotal(order),
  };
}

export async function withCustomerCancelRefundFieldsAsync<
  T extends {
    total: number;
    subtotal: number;
    discount: number;
    loyaltyDiscount: number;
    deliveryFee: number;
    convenientFee: number;
    paymentMethod: string;
    paymentStatus: string;
    status: string;
    createdAt: Date;
    cancelWindowStartsAt?: Date | null;
  },
>(
  order: T,
  cancelWindowMinutes: number,
  getPartialRefundPercentage: (status: OrderStatus) => Promise<number>,
) {
  const cancelFlags = getCustomerCancelEligibility({
    status: order.status,
    createdAt: order.createdAt,
    cancelWindowStartsAt: order.cancelWindowStartsAt,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    cancelWindowMinutes,
  });

  const partialRefundPercentage = cancelFlags.cancelRefundTier === 'partial'
    ? await getPartialRefundPercentage(order.status as OrderStatus)
    : null;

  return withCustomerCancelRefundFields(order, cancelWindowMinutes, partialRefundPercentage);
}
