/** Public site origin for order links & QR codes */
export function getSiteOrigin(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

/** Guest-friendly order tracking URL — no login required */
export function getOrderTrackUrl(orderNumber: string): string {
  return `${getSiteOrigin()}/order/${encodeURIComponent(orderNumber)}`;
}

const RECEIPT_FROM_KEY = 'bc-receipt-from';

/** Remember the page that opened a receipt so Back uses real history. */
export function markReceiptOpenedFrom(path?: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(RECEIPT_FROM_KEY, path || window.location.pathname);
  } catch {
    /* ignore */
  }
}

export function receiptWasOpenedFromApp(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const from = sessionStorage.getItem(RECEIPT_FROM_KEY);
    if (from && from !== window.location.pathname) return true;
  } catch {
    /* ignore */
  }

  const idx = (window.history.state as { idx?: number } | null)?.idx;
  if (typeof idx === 'number' && idx > 0) return true;

  try {
    if (!document.referrer) return false;
    const ref = new URL(document.referrer);
    return ref.origin === window.location.origin && ref.pathname !== window.location.pathname;
  } catch {
    return false;
  }
}
