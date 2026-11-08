import type { WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';

export type PayoutPeriodStatus = 'PAID' | 'PENDING' | 'IN_PROGRESS' | 'PAYMENT_PENDING';

export type PayoutPeriodRow = {
  key: string;
  periodFrom: string;
  periodTo: string;
  /** In-progress cycles: orders/summary run through this date (today). */
  summaryThrough?: string;
  status: PayoutPeriodStatus;
  amountCents: number;
  orderCount: number;
  breakdown?: unknown;
  withdrawal?: WithdrawalRow | null;
  draftInvoiceUrl?: string | null;
};

export type PayoutPeriodSort = 'newest' | 'oldest';

export const PAYOUT_PERIOD_AMOUNT_COLUMNS = [
  'Branch receives',
  'Customer convenience fee',
  'Net platform amount',
  'Delivery fee received',
] as const;

export type PayoutListTab = 'pending' | 'completed';
