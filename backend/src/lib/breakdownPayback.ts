/** Platform discount payback flag from a locked withdrawal / period breakdown snapshot. */
export function paybackEnabledFromBreakdown(breakdown: unknown): boolean {
  const b = breakdown as {
    platformDiscountPaybackEnabled?: boolean;
    platformPaybackTotal?: number;
  } | null;
  if (b?.platformDiscountPaybackEnabled != null) return b.platformDiscountPaybackEnabled;
  return (b?.platformPaybackTotal ?? 0) > 0;
}
