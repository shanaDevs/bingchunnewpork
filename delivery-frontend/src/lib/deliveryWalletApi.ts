import { resolveAdminRequestUrl } from '@/lib/deliveryApi';
import { withAdminCredentials } from '@/lib/adminSession';

export const DELIVERY_WALLET_UNLOCK_HEADER = 'X-Delivery-Wallet-Unlock';

export function deliveryWalletHeaders(
  unlockToken: string,
  extra?: HeadersInit,
): Record<string, string> {
  const extraObj =
    extra instanceof Headers
      ? Object.fromEntries(extra.entries())
      : Array.isArray(extra)
        ? Object.fromEntries(extra)
        : { ...(extra ?? {}) };
  const headers: Record<string, string> = {
    ...extraObj,
  };
  if (unlockToken) {
    headers[DELIVERY_WALLET_UNLOCK_HEADER] = unlockToken;
  }
  return headers;
}

export async function deliveryWalletFetch<T = unknown>(
  path: string,
  unlockToken: string,
  options?: RequestInit,
): Promise<T> {
  const headers = deliveryWalletHeaders(unlockToken, options?.headers);
  if (options?.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(
    resolveAdminRequestUrl(normalized),
    withAdminCredentials({
      ...options,
      headers,
    }),
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || json.error || 'Request failed');
  }
  return (json.data ?? json) as T;
}

export async function unlockDeliveryWallet(password: string): Promise<string> {
  const data = await deliveryWalletFetch<{ unlocked: boolean; token: string }>(
    '/admin/delivery-wallet/unlock',
    '',
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    },
  );
  if (!data.token) throw new Error('Unlock failed');
  return data.token;
}
