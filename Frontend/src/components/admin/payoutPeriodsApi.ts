import { adminAuthHeaders } from '@/lib/adminSession';
import type { PayoutPeriodRow } from '@/components/admin/payoutPeriodTypes';

export function payoutPeriodsQueryKey(storeId?: string) {
  return ['payout-periods', storeId ?? ''] as const;
}

export async function fetchPayoutPeriods(apiBase: string, storeId?: string): Promise<PayoutPeriodRow[]> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  const res = await fetch(`${apiBase}/admin/wallet/payout-periods${qs}`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load payout periods');
  const json = await res.json();
  return (json.data ?? []) as PayoutPeriodRow[];
}
