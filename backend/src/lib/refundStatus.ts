import type { RefundStatus } from '@prisma/client';

const ALLOWED_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  RECEIVED: ['COMPLETE', 'REJECTED'],
  COMPLETE: [],
  REJECTED: [],
};

export function assertValidRefundStatusTransition(from: RefundStatus, to: RefundStatus) {
  if (from === to) {
    throw new Error(`Refund is already ${to.toLowerCase()}`);
  }
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Cannot change refund from ${from} to ${to}`);
  }
}

export function refundStatusLabel(status: RefundStatus): string {
  switch (status) {
    case 'RECEIVED':
      return 'Received';
    case 'COMPLETE':
      return 'Complete';
    case 'REJECTED':
      return 'Rejected';
    default:
      return status;
  }
}
