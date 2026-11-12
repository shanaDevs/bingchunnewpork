import { getApiBaseUrl } from '@/lib/apiBase';
import { deliveryWalletHeaders } from '@/lib/deliveryWalletApi';
import { withAdminCredentials } from '@/lib/adminSession';

export const DELIVERY_PAYOUT_STATEMENT_ZIP_MAX = 40;

function ymd(value: string): string {
  return value.slice(0, 10);
}

function formatLongPeriodLabel(from: string, to: string): string {
  const fmt = (value: string, withYear: boolean) => {
    const [year, month, day] = ymd(value).split('-').map(Number);
    return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  };
  const fromStr = ymd(from);
  const toStr = ymd(to);
  const sameYear = fromStr.slice(0, 4) === toStr.slice(0, 4);
  return sameYear ? `${fmt(fromStr, false)} – ${fmt(toStr, false)}` : `${fmt(fromStr, true)} – ${fmt(toStr, true)}`;
}

export function deliveryPayoutStatementFilename(periodFrom: string, periodTo: string): string {
  return `Delivery Partner - ${formatLongPeriodLabel(periodFrom, periodTo)}.pdf`;
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

async function saveDeliveryWalletDownload(
  path: string,
  unlockToken: string,
  init: RequestInit,
  fallbackName: string,
): Promise<void> {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const headers = deliveryWalletHeaders(unlockToken, init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(
    `${getApiBaseUrl()}${normalized}`,
    withAdminCredentials({
      ...init,
      headers,
    }),
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

export async function downloadDeliveryPayoutStatement(
  payoutId: string,
  unlockToken: string,
  fallbackName: string,
): Promise<void> {
  await saveDeliveryWalletDownload(
    `/admin/delivery-wallet/payouts/${encodeURIComponent(payoutId)}/statement`,
    unlockToken,
    { method: 'GET' },
    fallbackName,
  );
}

export async function downloadDeliveryPayoutStatementZip(
  ids: string[],
  unlockToken: string,
): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  await saveDeliveryWalletDownload(
    '/admin/delivery-wallet/payouts/statement-zip',
    unlockToken,
    {
      method: 'POST',
      body: JSON.stringify({ ids }),
    },
    `delivery-payouts-${stamp}.zip`,
  );
}
