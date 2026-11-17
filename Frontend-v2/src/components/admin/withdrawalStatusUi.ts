import type { WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';

export function withdrawalStatusLabel(status: WithdrawalRow['status']): string {
  switch (status) {
    case 'APPROVED':
      return 'Paid';
    case 'PENDING':
      return 'Pending Approval';
    case 'IN_REVIEW':
      return 'In review';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

export function withdrawalStatusBadgeClass(status: WithdrawalRow['status']): string {
  switch (status) {
    case 'APPROVED':
      return 'admin-status-badge--green';
    case 'PENDING':
      return 'admin-status-badge--amber';
    case 'REJECTED':
      return 'admin-status-badge--red';
    default:
      return 'admin-status-badge--neutral';
  }
}