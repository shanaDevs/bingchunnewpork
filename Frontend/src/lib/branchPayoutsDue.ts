import type { QueryClient } from '@tanstack/react-query';
import type { PayoutDueRow } from '@/components/admin/PayoutsDuePanel';
import { adminAuthHeaders } from '@/lib/adminSession';

export type BranchPayoutCompletedMeta = {
  storeId: string;
  periodFrom: string;
  periodTo: string;
};

export const BRANCH_PAYOUTS_DUE_QUERY_KEY = ['branch-payouts-due'] as const;

/** Match API rows (ISO timestamps) with form dates (YYYY-MM-DD). */
export function normalizePayoutPeriodDate(value: string | null | undefined): string {
  if (!value) return '';
  const ymd = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : value;
}

function payoutPeriodMatches(
  rowFrom: string,
  rowTo: string,
  metaFrom: string,
  metaTo: string,
): boolean {
  return (
    normalizePayoutPeriodDate(rowFrom) === normalizePayoutPeriodDate(metaFrom) &&
    normalizePayoutPeriodDate(rowTo) === normalizePayoutPeriodDate(metaTo)
  );
}

/** @deprecated Month filter does not scope the due list; use BRANCH_PAYOUTS_DUE_QUERY_KEY. */
export function branchPayoutsDueQueryKey(_from?: string, _to?: string) {
  return BRANCH_PAYOUTS_DUE_QUERY_KEY;
}

export function sortBranchPayoutDueRows(rows: PayoutDueRow[]): PayoutDueRow[] {
  return [...rows].sort(
    (a, b) =>
      a.periodFrom.localeCompare(b.periodFrom) ||
      a.periodTo.localeCompare(b.periodTo) ||
      a.storeName.localeCompare(b.storeName),
  );
}

/** True when this row is the oldest unpaid period for its branch in the full due list. */
export function isOldestUnpaidBranchPayoutRow(row: PayoutDueRow, allRows: PayoutDueRow[]): boolean {
  const branchRows = allRows.filter((candidate) => candidate.storeId === row.storeId);
  if (branchRows.length === 0) return true;
  const oldest = branchRows.reduce((min, candidate) => {
    const byStart = candidate.periodFrom.localeCompare(min.periodFrom);
    if (byStart < 0) return candidate;
    if (byStart > 0) return min;
    return candidate.periodTo.localeCompare(min.periodTo) < 0 ? candidate : min;
  });
  return oldest.periodFrom === row.periodFrom && oldest.periodTo === row.periodTo;
}

export async function fetchBranchPayoutsDue(
  apiBase: string,
  signal?: AbortSignal,
): Promise<PayoutDueRow[]> {
  const accumulated: PayoutDueRow[] = [];
  let cursor: string | null = null;

  for (;;) {
    const qs = new URLSearchParams();
    if (cursor) qs.set('cursor', cursor);
    const suffix = qs.toString();
    const res = await fetch(
      `${apiBase}/admin/wallet/payouts-due${suffix ? `?${suffix}` : ''}`,
      {
        headers: adminAuthHeaders(),
        credentials: 'include',
        signal,
      },
    );
    if (!res.ok) return sortBranchPayoutDueRows(accumulated);
    const json = await res.json();
    const page = (json.data ?? {}) as {
      items?: PayoutDueRow[];
      nextCursor?: string | null;
      done?: boolean;
    };
    accumulated.push(...(page.items ?? []));
    const nextCursor = page.nextCursor ?? null;
    const done = page.done || !nextCursor || nextCursor === cursor;
    if (done) return sortBranchPayoutDueRows(accumulated);
    cursor = nextCursor;
  }
}

/** Drop a settled branch period from cached due lists (immediate UI update). */
export function removePaidBranchFromPayoutsDueCache(
  queryClient: QueryClient,
  meta: BranchPayoutCompletedMeta,
): void {
  queryClient.setQueriesData<PayoutDueRow[]>({ queryKey: ['branch-payouts-due'] }, (old) => {
    if (!old?.length) return old;
    return old.filter(
      (row) =>
        !(
          row.storeId === meta.storeId &&
          payoutPeriodMatches(row.periodFrom, row.periodTo, meta.periodFrom, meta.periodTo)
        ),
    );
  });
}

/** Invalidate and refetch due lists in the background (optimistic cache update is immediate). */
export function refreshBranchPayoutsDueQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['branch-payouts-due'] });
  void queryClient.invalidateQueries({ queryKey: ['payout-due-net-preview'] });
  void queryClient.refetchQueries({ queryKey: ['branch-payouts-due'], type: 'active' });
}
