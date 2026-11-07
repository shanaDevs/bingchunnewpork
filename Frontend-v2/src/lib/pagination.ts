export const ADMIN_TABLE_PAGE_SIZE = 10;

export const ADMIN_TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export type AdminTablePaginationState = {
  totalItems: number;
  totalPages: number;
  safePage: number;
  rangeStart: number;
  rangeEnd: number;
  pageList: (number | 'ellipsis')[];
};

/** Pagination window for server-paginated admin tables (uses API `meta.pages`). */
export function buildAdminMetaPagination(
  totalItems: number,
  page: number,
  pageSize: number,
  pagesFromMeta?: number,
): AdminTablePaginationState {
  const totalPages = Math.max(1, pagesFromMeta ?? 1);
  const safePage = Math.min(page, totalPages);
  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalItems);
  return {
    totalItems,
    totalPages,
    safePage,
    rangeStart,
    rangeEnd,
    pageList: buildPageList(safePage, totalPages),
  };
}

export type ClientListPaginationState<T> = AdminTablePaginationState & { slice: T[] };

/** In-memory pagination for lists already loaded on the client. */
export function paginateClientList<T>(
  items: T[],
  page: number,
  pageSize: number,
): ClientListPaginationState<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalItems);
  const slice = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  return {
    slice,
    totalItems,
    totalPages,
    safePage,
    rangeStart,
    rangeEnd,
    pageList: buildPageList(safePage, totalPages),
  };
}

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
