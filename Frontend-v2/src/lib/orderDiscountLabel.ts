import { deriveCleanDiscountPercent } from '@/lib/deriveCleanDiscountPercent';
import { formatJourneyPromoLabel } from '@/lib/journeyPromoLabel';

export { deriveCleanDiscountPercent };

type OrderDiscountLabelInput = {
  promoCode?: string | null;
  subtotal: number;
  discount: number;
};

/**
 * Parenthetical text for admin order discount lines — reflects the applied discount,
 * not catalog defaults (e.g. WELCOME10 vs loyalty campaign %).
 */
export function formatOrderDiscountSuffix(order: OrderDiscountLabelInput): string | null {
  const code = order.promoCode?.trim();
  if (code) {
    const journey = formatJourneyPromoLabel(code, {
      subtotal: order.subtotal,
      discount: order.discount,
    });
    if (journey) return journey;
  }

  const derived = deriveCleanDiscountPercent(order.subtotal, order.discount);
  if (derived != null) return `${derived}%`;

  return code ?? null;
}
