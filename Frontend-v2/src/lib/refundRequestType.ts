import type { AdminBadgeVariant } from '@/lib/adminBadges';

export type RefundRequestTypeRow = {
  submittedBy?: string | null;
  cancelledWithinWindow: boolean;
};

export type RefundRequestType = 'within_window' | 'after_window' | 'cashier';

export const REFUND_REQUEST_TYPE_BADGE: Record<RefundRequestType, AdminBadgeVariant> = {
  within_window: 'green',
  after_window: 'amber',
  cashier: 'purple',
};

export function refundRequestTypeOf(refund: RefundRequestTypeRow): RefundRequestType {
  if (refund.submittedBy === 'BRANCH_ADMIN') return 'cashier';
  if (refund.cancelledWithinWindow) return 'within_window';
  return 'after_window';
}

export function refundTypeLabel(
  refund: RefundRequestTypeRow,
  cancelWindowMinutes = 10,
): string {
  if (refund.submittedBy === 'BRANCH_ADMIN') return 'Cashier cancel';
  const minutesLabel =
    cancelWindowMinutes === 1 ? '1 min' : `${cancelWindowMinutes} min`;
  if (refund.cancelledWithinWindow) return `Within ${minutesLabel}`;
  return `After ${minutesLabel}`;
}
