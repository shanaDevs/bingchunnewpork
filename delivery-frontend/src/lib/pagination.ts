export const ADMIN_TABLE_PAGE_SIZE = 10;

export const ADMIN_TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function buildPageList(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 1) return total === 1 ? [1] : [];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const items: (number | 'ellipsis')[] = [1];
  const windowStart = Math.max(2, current - 1);
  const windowEnd = Math.min(total - 1, current + 1);

  if (windowStart > 2) items.push('ellipsis');
  for (let p = windowStart; p <= windowEnd; p++) items.push(p);
  if (windowEnd < total - 1) items.push('ellipsis');
  items.push(total);
  return items;
}
