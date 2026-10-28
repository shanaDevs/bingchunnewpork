import type { PayoutDueRow } from '@/components/admin/PayoutsDuePanel';
import { adminAuthHeaders } from '@/lib/adminSession';

export function branchPayoutsDueQueryKey(from: string, to: string) {
  return ['branch-payouts-due', from, to] as const;
}

export async function fetchBranchPayoutsDue(
  apiBase: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<PayoutDueRow[]> {
  const qs = new URLSearchParams({ from, to });
  const res = await fetch(`${apiBase}/admin/wallet/payouts-due?${qs}`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
    signal,
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? []) as PayoutDueRow[];
}
