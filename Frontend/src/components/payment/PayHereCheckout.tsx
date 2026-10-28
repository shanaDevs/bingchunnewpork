'use client';

import toast from 'react-hot-toast';

export interface PayHereSession {
  sandbox: boolean;
  merchant_id: string;
  return_url?: string;
  cancel_url?: string;
  notify_url: string;
  order_id: string;
  items: string;
  amount: string;
  currency: string;
  hash: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
}

declare global {
  interface Window {
    payhere?: {
      startPayment: (payment: Record<string, unknown>) => void;
      onCompleted: (orderId: string) => void;
      onDismissed: () => void;
      onError: (error: unknown) => void;
    };
  }
}

/** Build payload for PayHere onsite (popup) checkout */
function toPopupSession(session: PayHereSession): Record<string, unknown> {
  return {
    sandbox: session.sandbox,
    merchant_id: session.merchant_id,
    notify_url: session.notify_url,
    order_id: session.order_id,
    items: session.items,
    amount: session.amount,
    currency: session.currency,
    hash: session.hash,
    first_name: session.first_name,
    last_name: session.last_name,
    email: session.email,
    phone: session.phone,
    address: session.address,
    city: session.city,
    country: session.country,
    return_url: undefined,
    cancel_url: undefined,
  };
}

export function startPayHerePayment(
  session: PayHereSession,
  paymentUrl: string | undefined,
  onComplete: () => void,
  onDismiss: () => void
): boolean {
  if (typeof window === 'undefined') return false;

  const openRedirect = () => {
    if (paymentUrl) {
      window.location.href = paymentUrl;
      return true;
    }
    toast.error('Online payment checkout URL is missing');
    onDismiss();
    return false;
  };

  if (!window.payhere?.startPayment) {
    toast.loading('Opening online payment…', { id: 'payhere-load' });
    return openRedirect();
  }

  toast.dismiss('payhere-load');

  window.payhere.onCompleted = () => {
    void Promise.resolve(onComplete());
  };
  window.payhere.onDismissed = () => onDismiss();
  window.payhere.onError = (err) => {
    console.error('PayHere error', err);
    toast.error('Online payment could not open. Trying redirect…');
    openRedirect();
  };

  try {
    window.payhere.startPayment(toPopupSession(session));
    return true;
  } catch (err) {
    console.error('PayHere startPayment failed', err);
    return openRedirect();
  }
}

/** Preload PayHere script — call once on checkout page mount */
export function preloadPayHereScript(): void {
  if (typeof window === 'undefined') return;
  if (document.querySelector('script[data-payhere-sdk]')) return;

  const script = document.createElement('script');
  script.src = 'https://www.payhere.lk/lib/payhere.js';
  script.async = true;
  script.dataset.payhereSdk = 'true';
  script.onload = () => {
    const pending = (window as Window & { __bcPayherePending?: () => void }).__bcPayherePending;
    if (pending) {
      pending();
      delete (window as Window & { __bcPayherePending?: () => void }).__bcPayherePending;
    }
  };
  document.body.appendChild(script);
}

/** Wait until PayHere popup SDK is ready (or timeout). */
export function whenPayHereReady(timeoutMs = 8000): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.payhere?.startPayment) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    (window as Window & { __bcPayherePending?: () => void }).__bcPayherePending = done;
    preloadPayHereScript();
    window.setTimeout(done, timeoutMs);
  });
}

export async function startPayHerePaymentAsync(
  session: PayHereSession,
  paymentUrl: string | undefined,
  onComplete: () => void | Promise<void>,
  onDismiss: () => void,
): Promise<boolean> {
  await whenPayHereReady();
  return startPayHerePayment(session, paymentUrl, onComplete, onDismiss);
}
