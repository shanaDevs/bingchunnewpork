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
  /** Admin pickup amount limit when set; otherwise the built-in online-payment threshold. */
  cashAtCounterLimit?: number | null,
): T[] {
  if (orderMode !== 'TAKEAWAY') return methods;
  const threshold = activePickupMaxOrderAmount(cashAtCounterLimit) ?? PICKUP_ONLINE_PAYMENT_THRESHOLD;
  if (!requiresOnlinePaymentForPickup(subtotal, threshold)) return methods;
  return methods.filter((method) => method.id !== 'CASH_AT_COUNTER');
}

/** Returns a positive LKR cap, or null when no pickup max is configured. */
export function activePickupMaxOrderAmount(limit: number | null | undefined): number | null {
  if (limit == null || limit <= 0) return null;
  return limit;
}

export function isPickupOrderOverMaxAmount(
  total: number,
  limit: number | null | undefined,
): boolean {
  const active = activePickupMaxOrderAmount(limit);
  if (active == null) return false;
  return total > active;
}

export function pickupMaxOrderAmountToast(limit: number): string {
  return `You can order a maximum of LKR ${limit.toLocaleString()} for pickup.`;
}
