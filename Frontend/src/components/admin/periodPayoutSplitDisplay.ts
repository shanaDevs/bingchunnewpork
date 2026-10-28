import type { PeriodPayoutSplitLkr } from '@/components/admin/settlementTypes';

export type PeriodPayoutCardAmounts = {
  branchReceives: number;
  commissionLkr: number;
  orderConvenienceFeeLkr: number;
  deliveryFee: number;
};

export function resolvePeriodPayoutCardAmounts(input: {
  payoutSplit: PeriodPayoutSplitLkr | null;
  branchReceivesLkr?: number | null;
  platformCommissionLkr?: number | null;
  periodNetLkr?: number | null;
  deliveryFeeLkr?: number;
}): PeriodPayoutCardAmounts {
  const {
    payoutSplit,
    branchReceivesLkr = null,
    platformCommissionLkr = null,
    periodNetLkr = null,
    deliveryFeeLkr = 0,
  } = input;

  return {
    branchReceives: branchReceivesLkr ?? payoutSplit?.branchReceivesLkr ?? periodNetLkr ?? 0,
    commissionLkr: platformCommissionLkr ?? payoutSplit?.commissionLkr ?? 0,
    orderConvenienceFeeLkr: payoutSplit?.convenienceFeeLkr ?? 0,
    // Prefer explicit period delivery fee (from channel preview) over ledger breakdown split.
    deliveryFee: deliveryFeeLkr ?? payoutSplit?.deliveryFeeLkr ?? 0,
  };
}

export function formatPayoutAllocationPeriodLabel(dateFrom?: string, dateTo?: string) {
  if (!dateFrom && !dateTo) return null;
  if (dateFrom && dateTo) return `${dateFrom} - ${dateTo}`;
  return dateFrom || dateTo || null;
}
