/** Display label for active store count (e.g. "32+"). */
export function formatStoreCountLabel(count: number, fallback = 32): string {
  const value = count > 0 ? count : fallback;
  return `${value}+`;
}
