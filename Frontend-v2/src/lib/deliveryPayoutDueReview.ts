import { getApiBaseUrl } from '@/lib/apiBase';
import { deliveryWalletFetch, deliveryWalletHeaders } from '@/lib/deliveryWalletApi';
import { withAdminCredentials } from '@/lib/adminSession';
import { deliveryPayoutStatementFilename } from '@/lib/deliveryPayoutStatementDownload';

export type DeliveryPayoutDueReviewMark = {
  periodFrom: string;
  periodTo: string;
};

function ymd(value: string): string {
  return value.slice(0, 10);
}

export function deliveryPayoutDueReviewKey(mark: DeliveryPayoutDueReviewMark): string {
  return `${mark.periodFrom.slice(0, 10)}|${mark.periodTo.slice(0, 10)}`;
}

export function formatDeliveryPayoutReviewDraftError(message: string): string {
  if (/earliest due/i.test(message) || /earlier period/i.test(message)) {
    return `${message} Pay earlier periods in the queue first.`;
  }
  if (/not in the due list/i.test(message)) {
    return 'This payout period is no longer due. Refresh the list.';
  }
  return message;
}

export async function fetchDeliveryPayoutDueReviews(
  unlockToken: string,
): Promise<DeliveryPayoutDueReviewMark[]> {
  const rows = await deliveryWalletFetch<DeliveryPayoutDueReviewMark[]>(
    '/admin/delivery-wallet/payout-due-reviews',
    unlockToken,
  );
  return rows.map((row) => ({
    periodFrom: ymd(row.periodFrom),
    periodTo: ymd(row.periodTo),
  }));
}

export async function setDeliveryPayoutDueReview(
  unlockToken: string,
  mark: DeliveryPayoutDueReviewMark,
  inReview: boolean,
): Promise<void> {
  await deliveryWalletFetch(
    '/admin/delivery-wallet/payout-due-reviews',
    unlockToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        periodFrom: ymd(mark.periodFrom),
        periodTo: ymd(mark.periodTo),
        inReview,
      }),
    },
  );
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const starred = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (starred?.[1]) {
    try {
      return decodeURIComponent(starred[1]);
    } catch {
      return starred[1];
    }
  }
  const plain = header.match(/filename="([^"]+)"/i);
  return plain?.[1] ?? null;
}

export async function downloadDeliveryPayoutDueStatement(
  unlockToken: string,
  periodFrom: string,
  periodTo: string,
): Promise<void> {
  const params = new URLSearchParams({
    periodFrom: ymd(periodFrom),
    periodTo: ymd(periodTo),
  });
  const fallbackName = deliveryPayoutStatementFilename(periodFrom, periodTo);
  const headers = deliveryWalletHeaders(unlockToken);
  const res = await fetch(
    `${getApiBaseUrl()}/admin/delivery-wallet/payouts-due/statement?${params.toString()}`,
    withAdminCredentials({ method: 'GET', headers }),
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(json.message || 'Could not download the payout statement');
  }
  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get('Content-Disposition')) || fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}