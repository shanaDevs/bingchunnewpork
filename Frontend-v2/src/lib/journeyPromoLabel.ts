import { deriveCleanDiscountPercent } from '@/lib/deriveCleanDiscountPercent';

/** Human-readable labels for new-customer journey promo codes on admin order UI. */
export function formatJourneyPromoLabel(
  promoCode: string | null | undefined,
  opts?: {
    discountValue?: number | null;
    discountType?: string | null;
    subtotal?: number | null;
    discount?: number | null;
  },
): string | null {
  if (!promoCode?.trim()) return null;
  const code = promoCode.trim().toUpperCase();

  if (code === 'LOYALTY-OFFER1' || code === 'LOYALTY_OFFER_1') {
    const fromApplied =
      typeof opts?.subtotal === 'number' && typeof opts?.discount === 'number'
        ? deriveCleanDiscountPercent(opts.subtotal, opts.discount)
        : null;
    const pct =
      fromApplied ??
      (typeof opts?.discountValue === 'number' && opts.discountValue > 0 && opts.discountValue <= 100
        ? opts.discountValue
        : null);
    if (pct != null) {
      return `1st order - welcome discount (${pct}%)`;
    }
    return '1st order - welcome discount';
  }

  if (code === 'LOYALTY-OFFER2' || code === 'LOYALTY_OFFER_2' || code === 'LOYALTY-OFFER2-GIFT') {
    return '2nd order - free gift / follow-up offer';
  }

  if (code.startsWith('LOYALTY-') || code.startsWith('LOYALTY_')) {
    return code.replace(/_/g, '-');
  }

  return null;
}

/** Prefer journey label; fall back to raw promo code. */
export function formatOrderPromoDisplay(
  promoCode: string | null | undefined,
  opts?: {
    discountValue?: number | null;
    discountType?: string | null;
    subtotal?: number | null;
    discount?: number | null;
  },
): string | null {
  if (!promoCode?.trim()) return null;
  return formatJourneyPromoLabel(promoCode, opts) ?? promoCode.trim();
}
