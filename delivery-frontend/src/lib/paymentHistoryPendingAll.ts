import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

export type PendingAllUnsettledWithdrawal = {
  id: string;
  amount: number;
  amountLkr: number;
  finalPayoutAmount?: number;
  finalPayoutAmountLkr?: number;
  periodFrom: string | null;
  periodTo: string | null;
  status: string;
  breakdown: unknown;
  remarks: string | null;
  isAdvance: boolean;
  createdAt: string;
  platformProviderReceivable?: {
    lkr: import('@bingchun/settlement').PlatformProviderReceivableLkr;
  } | null;
  dartCodesReceives?: number;
};

export type PendingAllBranchRow = {
  storeId: string;
  storeName: string;
  pendingDues: number;
  periodCommission: number;
  periodConvenienceFee?: number;
  periodPlatformPayback?: number;
  netPlatformEarning?: number;
  dartCodesReceives: number;
  orderCount: number;
  walletRemaining?: number;
  hasOverlap: boolean;
  requiresPayout: boolean;
  unsettledWithdrawals: PendingAllUnsettledWithdrawal[];
};

export type PaymentHistoryPendingAllResult = {
  items: PendingAllBranchRow[];
  totalWalletRemaining: number;
};

export function paymentHistoryPendingAllQueryKey(from: string, to: string) {
  return ['payment-history-pending-all', from, to] as const;
}

export async function fetchPaymentHistoryPendingAll(
  from: string,
  to: string,
): Promise<PaymentHistoryPendingAllResult> {
  const qs = new URLSearchParams({ from, to });
  const res = await fetch(
    `${getApiBaseUrl()}/admin/payment-history/pending-all?${qs}`,
    {
      headers: adminAuthHeaders(), credentials: 'include',
    },
  );
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.message || 'Failed to load branches');
  }
  return {
    items: (json.data ?? []) as PendingAllBranchRow[],
    totalWalletRemaining: Number(json.summary?.totalWalletRemaining ?? 0),
  };
}
