/** Integer % that exactly matches a floored subtotal discount (same rule as cart/checkout). */
export function deriveCleanDiscountPercent(subtotal: number, discount: number): number | null {
  if (subtotal <= 0 || discount <= 0) return null;
  const pct = Math.round((discount / subtotal) * 100);
  if (pct < 1 || pct > 100) return null;
  return Math.floor((subtotal * pct) / 100) === discount ? pct : null;
}
