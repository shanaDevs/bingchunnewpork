import type { WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';

export type PayoutListTab = 'pending' | 'completed';

export type PayoutPeriodStatus =
  | 'PAID'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'PAYMENT_PENDING';

export type PayoutPeriodRow = {
  key: string;
  periodFrom: string;
  periodTo: string;
  summaryThrough?: string;
  status: PayoutPeriodStatus;
  amountCents: number;
  orderCount: number;
  breakdown?: unknown;
  withdrawal?: WithdrawalRow | null;
  draftInvoiceUrl?: string | null;
};