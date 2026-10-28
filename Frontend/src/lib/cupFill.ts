/** Map item count to cup fill (8 items = full cup) */
export function cupFillFromCount(count: number, max = 8): number {
  if (count <= 0) return 0;
  return Math.min(count / max, 1);
}
