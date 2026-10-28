export const DEFAULT_DELIVERY_CONVENIENCE_FEE_RATE = 0.075;
export const DEFAULT_PICKUP_CONVENIENCE_FEE_RATE = 0.06;

/** @deprecated Use DEFAULT_DELIVERY_CONVENIENCE_FEE_RATE */
export const DEFAULT_CONVENIENCE_FEE_RATE = DEFAULT_DELIVERY_CONVENIENCE_FEE_RATE;

export type ConvenienceFeeRates = {
  pickup: number;
  delivery: number;
};

const ONLINE_PAYMENT_METHODS = new Set(['PAYHERE', 'CARD']);

/**
 * Convenience fee applies to online payments (CARD / PAYHERE) and to pickup
 * cash-at-counter (available for takeaway under LKR 1000).
 */
export function appliesConvenienceFee(
  orderMode: string | null | undefined,
  paymentMethod: string | null | undefined,
): boolean {
  if (orderMode !== 'DELIVERY' && orderMode !== 'TAKEAWAY') return false;
  if (!paymentMethod) return false;
  if (ONLINE_PAYMENT_METHODS.has(paymentMethod)) return true;
  return orderMode === 'TAKEAWAY' && paymentMethod === 'CASH_AT_COUNTER';
}

export function convenienceFeeRateForOrder(
  orderMode: string | null | undefined,
  rates: ConvenienceFeeRates = {
    pickup: DEFAULT_PICKUP_CONVENIENCE_FEE_RATE,
    delivery: DEFAULT_DELIVERY_CONVENIENCE_FEE_RATE,
  },
): number {
  if (orderMode === 'TAKEAWAY') return rates.pickup;
  if (orderMode === 'DELIVERY') return rates.delivery;
  return 0;
}

/** Item subtotal only — delivery fee is never included in the convenience fee base. */
export function convenienceFeeBase(orderSubtotal: number): number {
  return Math.max(0, orderSubtotal);
}

export function computeConvenienceFee(
  orderSubtotal: number,
  orderMode: string | null | undefined,
  paymentMethod: string | null | undefined,
  rates: ConvenienceFeeRates = {
    pickup: DEFAULT_PICKUP_CONVENIENCE_FEE_RATE,
    delivery: DEFAULT_DELIVERY_CONVENIENCE_FEE_RATE,
  },
): number {
  if (!appliesConvenienceFee(orderMode, paymentMethod)) return 0;
  const rate = convenienceFeeRateForOrder(orderMode, rates);
  return Math.round(convenienceFeeBase(orderSubtotal) * rate);
}

/** Customer-facing charge — pickup convenience fee is waived (shown crossed out at checkout). */
export function chargedConvenienceFee(
  orderSubtotal: number,
  orderMode: string | null | undefined,
  paymentMethod: string | null | undefined,
  rates: ConvenienceFeeRates = {
    pickup: DEFAULT_PICKUP_CONVENIENCE_FEE_RATE,
    delivery: DEFAULT_DELIVERY_CONVENIENCE_FEE_RATE,
  },
): number {
  if (orderMode === 'TAKEAWAY') return 0;
  return computeConvenienceFee(orderSubtotal, orderMode, paymentMethod, rates);
}

export function formatConvenienceFeeLabel(
  orderMode?: string | null,
  rates: ConvenienceFeeRates = {
    pickup: DEFAULT_PICKUP_CONVENIENCE_FEE_RATE,
    delivery: DEFAULT_DELIVERY_CONVENIENCE_FEE_RATE,
  },
): string {
  const rate = orderMode ? convenienceFeeRateForOrder(orderMode, rates) : rates.delivery;
  const pct = Math.round(rate * 1000) / 10;
  if (orderMode === 'DELIVERY') {
    return `Convenience fee (${pct}% of items)`;
  }
  return `Convenience fee (${pct}%)`;
}

export function resolveCheckoutConvenienceRates(config?: {
  convenientFeeRate?: number;
  pickupConvenientFeeRate?: number;
  deliveryConvenientFeeRate?: number;
}): ConvenienceFeeRates {
  return {
    pickup: config?.pickupConvenientFeeRate ?? config?.convenientFeeRate ?? DEFAULT_PICKUP_CONVENIENCE_FEE_RATE,
    delivery:
      config?.deliveryConvenientFeeRate ??
      config?.convenientFeeRate ??
      DEFAULT_DELIVERY_CONVENIENCE_FEE_RATE,
  };
}
