/** PayHere appends these query params when redirecting back after checkout. */
export type PayHereReturnParams = {
  merchant_id?: string;
  order_id?: string;
  payment_id?: string;
  payhere_amount?: string;
  payhere_currency?: string;
  status_code?: string;
  md5sig?: string;
};

export function readPayHereReturnParams(search: URLSearchParams): PayHereReturnParams | null {
  const status_code = search.get('status_code');
  const md5sig = search.get('md5sig');
  const payment_id = search.get('payment_id');
  if (!status_code && !md5sig && !payment_id) return null;

  return {
    merchant_id: search.get('merchant_id') ?? undefined,
    order_id: search.get('order_id') ?? undefined,
    payment_id: payment_id ?? undefined,
    payhere_amount: search.get('payhere_amount') ?? undefined,
    payhere_currency: search.get('payhere_currency') ?? undefined,
    status_code: status_code ?? undefined,
    md5sig: md5sig ?? undefined,
  };
}

export function paymentReturnStorageKey(orderNumber: string): string {
  return `bc-payment-return-${orderNumber}`;
}

const handledReturns = new Set<string>();

/** Claim one-time payment return handling (survives React Strict Mode remounts). */
export function claimPaymentReturn(orderNumber: string): boolean {
  if (typeof window !== 'undefined') {
    const key = paymentReturnStorageKey(orderNumber);
    if (sessionStorage.getItem(key) === '1') return false;
  }
  if (handledReturns.has(orderNumber)) return false;
  handledReturns.add(orderNumber);
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(paymentReturnStorageKey(orderNumber), '1');
  }
  return true;
}

/** Allow a new PayHere return after Pay Again. */
export function resetPaymentReturn(orderNumber: string): void {
  handledReturns.delete(orderNumber);
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(paymentReturnStorageKey(orderNumber));
  }
}
