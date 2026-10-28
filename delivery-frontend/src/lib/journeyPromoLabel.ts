/** Human-readable labels for new-customer journey promo codes on admin order UI. */
export function formatJourneyPromoLabel(
  promoCode: string | null | undefined,
  opts?: { discountValue?: number | null; discountType?: string | null },
): string | null {
  if (!promoCode?.trim()) return null;
  const code = promoCode.trim().toUpperCase();

  if (code === 'LOYALTY-OFFER1' || code === 'LOYALTY_OFFER_1') {
    const pct =
      opts?.discountType === 'PERCENTAGE' && typeof opts.discountValue === 'number' && opts.discountValue > 0
        ? opts.discountValue
        : typeof opts?.discountValue === 'number' && opts.discountValue > 0 && opts.discountValue <= 100
          ? opts.discountValue
          : 40;
    return `1st order - welcome discount (${pct}%)`;
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
  opts?: { discountValue?: number | null; discountType?: string | null },
): string | null {
  if (!promoCode?.trim()) return null;
  return formatJourneyPromoLabel(promoCode, opts) ?? promoCode.trim();
}
