'use client';

import { adminBadgeClass, type AdminBadgeVariant } from '@/lib/adminBadges';
import {
  REFUND_REQUEST_TYPE_BADGE,
  refundRequestTypeOf,
  refundTypeLabel,
  type RefundRequestTypeRow,
} from '@/lib/refundRequestType';

export type RefundStatus = 'RECEIVED' | 'COMPLETE' | 'REJECTED';

const REFUND_STATUS_BADGE: Record<RefundStatus, AdminBadgeVariant> = {
  RECEIVED: 'yellow',
  COMPLETE: 'blue',
  REJECTED: 'red',
};

const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  RECEIVED: 'Received',
  COMPLETE: 'Complete',
  REJECTED: 'Rejected',
};

export function refundStatusLabel(status: string): string {
  if (status === 'PAID') return 'Complete';
  return REFUND_STATUS_LABEL[status as RefundStatus] ?? status;
}

export function refundSubmittedByLabel(value?: string | null): string {
  return value === 'BRANCH_ADMIN' ? 'Cashier' : 'Customer';
}

export function RefundSubmittedByBadge({ submittedBy }: { submittedBy?: string | null }) {
  const isBranch = submittedBy === 'BRANCH_ADMIN';
  return (
    <span className={adminBadgeClass(isBranch ? 'purple' : 'teal')}>
      {refundSubmittedByLabel(submittedBy)}
    </span>
  );
}

export function RefundRequestTypeBadge({
  refund,
  cancelWindowMinutes = 10,
}: {
  refund: RefundRequestTypeRow;
  cancelWindowMinutes?: number;
}) {
  const type = refundRequestTypeOf(refund);
  return (
    <span className={adminBadgeClass(REFUND_REQUEST_TYPE_BADGE[type])}>
      {refundTypeLabel(refund, cancelWindowMinutes)}
    </span>
  );
}

export function RefundStatusBadge({ status }: { status: string }) {
  const normalized = status === 'PAID' ? 'COMPLETE' : status;
  const variant = REFUND_STATUS_BADGE[normalized as RefundStatus] ?? 'neutral';
  return (
    <span className={adminBadgeClass(variant)}>
      {refundStatusLabel(status)}
    </span>
  );
}

export default RefundStatusBadge;
