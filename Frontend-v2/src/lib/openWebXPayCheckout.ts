import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import toast from 'react-hot-toast';
import { getWebxpayCheckoutUrl } from '@/lib/apiBase';
import { markOrderAwaitingPayment, markPaidRedirect } from '@/lib/orderCelebration';

function normalizePaymentUrl(url: string): string {
  return url.replace(/([^:]\/)\/+/g, '$1');
}

function resolveWebXPayCheckoutUrl(orderNumber: string, paymentUrl?: string, trackToken?: string): string {
  const fallback = getWebxpayCheckoutUrl(orderNumber, trackToken);
  if (!paymentUrl) return fallback;
  const normalized = normalizePaymentUrl(paymentUrl);
  if (normalized.includes('/checkout/webxpay/')) return fallback;
  if (normalized.includes('/payments/webxpay/')) {
    if (trackToken && !normalized.includes('t=')) {
      const join = normalized.includes('?') ? '&' : '?';
      return `${normalized}${join}t=${encodeURIComponent(trackToken)}`;
    }
    return normalized;
  }
  return fallback;
}

/** Redirect via backend proxy — encryption + POST happen server-side. */
export async function openWebXPayCheckout(options: {
  orderNumber: string;
  trackToken?: string;
  router: AppRouterInstance;
  paymentUrl?: string;
}): Promise<void> {
  const { orderNumber, trackToken, paymentUrl } = options;

  markOrderAwaitingPayment(orderNumber);
  toast.success('Redirecting to secure payment…', { icon: '💳' });

  window.location.href = resolveWebXPayCheckoutUrl(orderNumber, paymentUrl, trackToken);
}

export function handleWebXPayReturnPaid(
  trackTokenOrOrderNumber: string,
  router: AppRouterInstance,
): void {
  markPaidRedirect(trackTokenOrOrderNumber);
  router.push(`/order/${encodeURIComponent(trackTokenOrOrderNumber)}?paid=1`);
}
