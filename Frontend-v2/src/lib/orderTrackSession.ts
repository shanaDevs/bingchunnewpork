/** Remember unguessable track tokens so payment-return pages that land on
 *  `/order/{orderNumber}` can still authorize the GET without a login cookie. */

const KEY_PREFIX = 'bc-order-track:';

export function rememberOrderTrackToken(orderNumber: string, trackToken?: string | null): void {
  if (typeof window === 'undefined') return;
  const number = orderNumber?.trim();
  const token = trackToken?.trim();
  if (!number || !token) return;
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${number}`, token);
  } catch {
    /* private mode / quota */
  }
}

export function recallOrderTrackToken(orderNumberOrId: string): string | null {
  if (typeof window === 'undefined') return null;
  const key = orderNumberOrId?.trim();
  if (!key) return null;
  try {
    return sessionStorage.getItem(`${KEY_PREFIX}${key}`);
  } catch {
    return null;
  }
}

/** Build `/orders/:id` path, attaching `?t=` when a remembered track token helps. */
export function orderApiPath(orderIdOrNumber: string): string {
  const id = encodeURIComponent(orderIdOrNumber);
  const token = recallOrderTrackToken(orderIdOrNumber);
  if (!token || token === orderIdOrNumber) return `/orders/${id}`;
  return `/orders/${id}?t=${encodeURIComponent(token)}`;
}
