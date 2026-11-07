/** Session flag set after checkout; cleared after successful payment confirmation */
export const ORDER_CELEBRATION_STORAGE_KEY = 'bc-order-celebration';

/** Set when redirecting to PayHere; survives return URL without celebrate=1 */
export const AWAITING_PAYMENT_STORAGE_KEY = 'bc-awaiting-payment';

/** Set when backend redirects back with ?paid=1 (survives URL cleanup + Strict Mode) */
export const PAID_REDIRECT_STORAGE_KEY = 'bc-paid-redirect';

export function markOrderForCelebration(orderNumber: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(ORDER_CELEBRATION_STORAGE_KEY, orderNumber);
  } catch {
    /* ignore */
  }
}

export function markOrderAwaitingPayment(orderNumber: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(AWAITING_PAYMENT_STORAGE_KEY, orderNumber);
  } catch {
    /* ignore */
  }
}

export function peekOrderCelebrationFlag(orderNumber: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(ORDER_CELEBRATION_STORAGE_KEY) === orderNumber;
  } catch {
    return false;
  }
}

export function hasAwaitingPaymentFlag(orderNumber: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(AWAITING_PAYMENT_STORAGE_KEY) === orderNumber;
  } catch {
    return false;
  }
}

export function markPaidRedirect(orderNumber: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PAID_REDIRECT_STORAGE_KEY, orderNumber);
  } catch {
    /* ignore */
  }
}

export function hasPaidRedirectFlag(orderNumber: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(PAID_REDIRECT_STORAGE_KEY) === orderNumber;
  } catch {
    return false;
  }
}

export function clearOrderPaymentFlags(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(ORDER_CELEBRATION_STORAGE_KEY);
    sessionStorage.removeItem(AWAITING_PAYMENT_STORAGE_KEY);
    sessionStorage.removeItem(PAID_REDIRECT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** @deprecated use peekOrderCelebrationFlag — consuming too early breaks Strict Mode remounts */
export function consumeOrderCelebrationFlag(orderNumber: string): boolean {
  if (!peekOrderCelebrationFlag(orderNumber)) return false;
  clearOrderPaymentFlags();
  return true;
}
