/** Pickup orders at or above this subtotal (LKR) must be paid online by card. */
export const PICKUP_ONLINE_PAYMENT_THRESHOLD = 1000;

export function requiresOnlinePaymentForPickup(
  subtotal: number,
  threshold = PICKUP_ONLINE_PAYMENT_THRESHOLD,
): boolean {
  return subtotal >= threshold;
}

export function filterCheckoutPaymentMethods<T extends { id: string }>(
  methods: T[],
  orderMode: 'DELIVERY' | 'TAKEAWAY' | null | undefined,
  subtotal: number,
): T[] {
  if (orderMode !== 'TAKEAWAY' || !requiresOnlinePaymentForPickup(subtotal)) {
    return methods;
  }
  return methods.filter((method) => method.id !== 'CASH_AT_COUNTER');
}

/** App-configured pickup online-payment threshold; null when unset or invalid. */
export function activePickupMaxOrderAmount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function pickupMaxOrderAmountToast(thresholdLkr: number): string {
  return `Takeaway orders of LKR ${thresholdLkr.toLocaleString()} or more must be paid online.`;
}
