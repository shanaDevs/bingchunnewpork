import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';
import type { PlatformProviderReceivableLkr } from '@bingchun/settlement';

export type PlatformPayoutStatement = {
  id: string;
  statementRef: string;
  storeId: string;
  storeName: string;
  storeWithdrawalId: string;
  paymentMethod: string;
  status: string;
  period: { from: string; to: string };
  submittedAt: string;
  platformReceivable: number;
  platformProviderReceivable: { lkr: PlatformProviderReceivableLkr };
  platformDiscountPaybackEnabled: boolean;
  sharedPromoPlatformLkr: number;
  platformInvoiceUrl: string;
  hasReceipt?: boolean;
};

export async function fetchPlatformPayoutStatement(
  settlementId: string,
): Promise<PlatformPayoutStatement> {
  const res = await fetch(
    `${getApiBaseUrl()}/admin/payment-history/settlements/${encodeURIComponent(settlementId)}/platform-receivable`,
    { headers: adminAuthHeaders(), credentials: 'include' },
  );
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.message || 'Failed to load platform payout breakdown');
  }
  return json.data as PlatformPayoutStatement;
}
