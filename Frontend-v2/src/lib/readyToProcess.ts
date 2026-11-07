import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';
import type { PlatformProviderReceivableLkr } from '@bingchun/settlement';

export type ReadyToProcessMonthRow = {
  month: string;
  label: string;
  totalReceivable: number;
  branchCount: number;
  payoutCount: number;
};

export type ReadyToProcessPeriodRow = {
  withdrawalId: string;
  periodFrom: string | null;
  periodTo: string | null;
  dartCodesReceives: number;
  platformProviderReceivable: { lkr: PlatformProviderReceivableLkr } | null;
};

export type ReadyToProcessBranchRow = {
  storeId: string;
  storeName: string;
  totalReceivable: number;
  /** Current branch setting (Settings → Platform Discount Payback). Controls SPPC deduction in UI. */
  platformDiscountPaybackEnabled: boolean;
  /** Locked snapshot: platform share of SHARED promos (LKR), from withdrawal breakdown. */
  sharedPromoPlatformLkr: number;
  platformProviderReceivable: { lkr: PlatformProviderReceivableLkr };
  periods: ReadyToProcessPeriodRow[];
};

export type ReadyToProcessMonthDetail = {
  month: string;
  label: string;
  totalReceivable: number;
  branches: ReadyToProcessBranchRow[];
};

export function readyToProcessMonthsQueryKey() {
  return ['payment-history-ready-to-process'] as const;
}

export function readyToProcessMonthDetailQueryKey(month: string) {
  return ['payment-history-ready-to-process', month] as const;
}

export async function fetchReadyToProcessMonths(): Promise<ReadyToProcessMonthRow[]> {
  const res = await fetch(`${getApiBaseUrl()}/admin/payment-history/ready-to-process`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.message || 'Failed to load ready-to-process months');
  }
  return (json.data ?? []) as ReadyToProcessMonthRow[];
}

export async function fetchReadyToProcessMonthDetail(
  month: string,
): Promise<ReadyToProcessMonthDetail> {
  const res = await fetch(
    `${getApiBaseUrl()}/admin/payment-history/ready-to-process/${encodeURIComponent(month)}`,
    {
      headers: adminAuthHeaders(),
      credentials: 'include',
    },
  );
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.message || 'Failed to load month breakdown');
  }
  return json.data as ReadyToProcessMonthDetail;
}

export type BulkSettleItem = {
  storeId: string;
  withdrawalId: string;
};
