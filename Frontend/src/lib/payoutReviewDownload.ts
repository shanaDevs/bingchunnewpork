import { adminApiFetch } from '@/lib/adminApi';
import { getApiBaseUrl } from '@/lib/apiBase';
import { ensureAdminAccessToken, withAdminCredentials } from '@/lib/adminSession';
import { formatBranchName } from '@/lib/deliveryDisplay';

export type PayoutReviewMark = {
  storeId: string;
  periodFrom: string;
  periodTo: string;
};

export function payoutReviewMarkKey(mark: PayoutReviewMark): string {
  return `${mark.storeId}|${mark.periodFrom.slice(0, 10)}|${mark.periodTo.slice(0, 10)}`;
}

function ymd(value: string): string {
  return value.slice(0, 10);
}

export async function fetchPayoutReviews(): Promise<PayoutReviewMark[]> {
  const rows = await adminApiFetch<PayoutReviewMark[]>('/admin/wallet/payout-reviews');
  return rows.map((row) => ({
    storeId: row.storeId,
    periodFrom: ymd(row.periodFrom),
    periodTo: ymd(row.periodTo),
  }));
}

export async function setPayoutInReview(mark: PayoutReviewMark, inReview: boolean): Promise<void> {
  await adminApiFetch('/admin/wallet/payout-reviews', {
    method: 'PUT',
    body: JSON.stringify({
      storeId: mark.storeId,
      periodFrom: ymd(mark.periodFrom),
      periodTo: ymd(mark.periodTo),
      inReview,
    }),
  });
}

function formatLongPeriodLabel(from: string, to: string): string {
  const fmt = (value: string, withYear: boolean) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  };
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return sameYear ? `${fmt(from, false)} – ${fmt(to, false)}` : `${fmt(from, true)} – ${fmt(to, true)}`;
}

export function payoutReviewPdfFilename(
  storeName: string,
  displayFrom: string,
  displayTo: string,
  cycleStage: 'FIRST' | 'SECOND' | undefined,
): string {
  const branch = formatBranchName(storeName).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  const ordinal = cycleStage === 'SECOND' ? 'Second Payout' : 'First Payout';
  return `${branch || 'Branch'} - ${formatLongPeriodLabel(displayFrom, displayTo)} (${ordinal}).pdf`;
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

async function saveAdminDownload(path: string, init: RequestInit, fallbackName: string): Promise<void> {
  const ok = await ensureAdminAccessToken();
  if (!ok) throw new Error('Session expired');
  const res = await fetch(`${getApiBaseUrl()}${path}`, withAdminCredentials(init));
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(json.message || 'Could not download the payout invoice');
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

export async function downloadPayoutReviewPdf(
  mark: PayoutReviewMark,
  fallbackName: string,
): Promise<void> {
  const params = new URLSearchParams({
    storeId: mark.storeId,
    periodFrom: ymd(mark.periodFrom),
    periodTo: ymd(mark.periodTo),
  });
  await saveAdminDownload(`/admin/wallet/payout-review-invoice?${params.toString()}`, { method: 'GET' }, fallbackName);
}

export async function downloadPayoutReviewZip(items: PayoutReviewMark[]): Promise<void> {
  await saveAdminDownload(
    '/admin/wallet/payout-review-zip',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((item) => ({
          storeId: item.storeId,
          periodFrom: ymd(item.periodFrom),
          periodTo: ymd(item.periodTo),
        })),
      }),
    },
    'branch-payout-invoices.zip',
  );
}
