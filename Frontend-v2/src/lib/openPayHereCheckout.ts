import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { getPayhereCheckoutUrl } from '@/lib/apiBase';
import {
  preloadPayHereScript,
  startPayHerePaymentAsync,
  type PayHereSession,
} from '@/components/payment/PayHereCheckout';
import { markOrderAwaitingPayment, markPaidRedirect } from '@/lib/orderCelebration';
import { resetPaymentReturn } from '@/lib/payhereReturn';

type PayHereSessionResponse = {
  alreadyPaid?: boolean;
  payhere?: PayHereSession;
  paymentUrl?: string;
};

export function preparePayHereScript(): void {
  preloadPayHereScript();
}

function orderTrackPath(trackToken: string): string {
  return `/order/${encodeURIComponent(trackToken)}`;
}

function trackTokenQuery(trackToken?: string): string {
  return trackToken ? `?t=${encodeURIComponent(trackToken)}` : '';
}

/** Open PayHere popup and navigate to order page on success (no full site reload). */
export async function openPayHereCheckout(options: {
  orderNumber: string;
  trackToken?: string;
  router: AppRouterInstance;
  payhere?: PayHereSession;
  paymentUrl?: string;
  onDismiss?: () => void;
}): Promise<void> {
  const { orderNumber, trackToken, router, onDismiss } = options;
  let payhere = options.payhere;
  let paymentUrl = options.paymentUrl;

  resetPaymentReturn(orderNumber);
  markOrderAwaitingPayment(orderNumber);
  if (trackToken) {
    const { rememberOrderTrackToken } = await import('@/lib/orderTrackSession');
    rememberOrderTrackToken(orderNumber, trackToken);
  }
  preparePayHereScript();

  if (!payhere) {
    const session = await api.get<PayHereSessionResponse>(
      `/payments/payhere/${encodeURIComponent(orderNumber)}/session${trackTokenQuery(trackToken)}`,
    );
    if (session.alreadyPaid) {
      markPaidRedirect(orderNumber);
      if (trackToken) router.push(orderTrackPath(trackToken));
      else router.push(`/order/${encodeURIComponent(orderNumber)}`);
      return;
    }
    payhere = session.payhere;
    paymentUrl = session.paymentUrl;
  }

  const goToOrder = async () => {
    const confirmPath = trackToken
      ? `/orders/${encodeURIComponent(trackToken)}/confirm-payhere-popup${trackTokenQuery(trackToken)}`
      : `/orders/${encodeURIComponent(orderNumber)}/confirm-payhere-popup`;

    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const result = await api.post<{ paymentStatus?: string; confirmation?: string }>(
          confirmPath,
          trackToken ? { trackToken } : {},
        );
        if (result.paymentStatus === 'PAID' || result.confirmation !== 'PENDING') break;
      } catch {
        /* webhook may still be in flight */
      }
      if (attempt < 5) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }

    markPaidRedirect(orderNumber);
    if (trackToken) router.push(orderTrackPath(trackToken));
    else router.push(`/order/${encodeURIComponent(orderNumber)}`);
  };

  const handleDismiss = () => {
    onDismiss?.();
  };

  if (!payhere) {
    window.location.href = getPayhereCheckoutUrl(orderNumber, trackToken);
    return;
  }

  const opened = await startPayHerePaymentAsync(payhere, paymentUrl, goToOrder, handleDismiss);
  if (!opened) {
    toast.error('Could not open online payment. Redirecting…');
    window.location.href = paymentUrl || getPayhereCheckoutUrl(orderNumber, trackToken);
  }
}
