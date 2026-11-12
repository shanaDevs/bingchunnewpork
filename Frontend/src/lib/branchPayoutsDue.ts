import type { QueryClient } from '@tanstack/react-query';
import type { PayoutDueRow } from '@/components/admin/PayoutsDuePanel';
import { formatBranchName } from '@/lib/deliveryDisplay';
import { adminAuthHeaders } from '@/lib/adminSession';

export type BranchPayoutCompletedMeta = {
  storeId: string;
  periodFrom: string;
  periodTo: string;
};

export const PAYOUTS_DUE_PAGE_SIZE = 10;

export const BRANCH_PAYOUTS_DUE_QUERY_KEY = ['branch-payouts-due'] as const;

export type BranchPayoutsDuePage = {
  items: PayoutDueRow[];
  total: number;
  allTotal: number;
  page: number;
  limit: number;
  pages: number;
};

export type FetchBranchPayoutsDueParams = {
  page?: number;
  limit?: number;
  search?: string;
  storeId?: string | null;
  from?: string | null;
  to?: string | null;
};

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

export function branchPayoutsDueQueryKey(
  page = 1,
  search = '',
  storeId = '',
  from = '',
  to = '',
) {
  return [...BRANCH_PAYOUTS_DUE_QUERY_KEY, page, search, storeId, from, to] as const;
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
  if (typeof row.isOldestUnpaid === 'boolean') return row.isOldestUnpaid;
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

const DRAFT_PAY_EARLIER_PERIOD_NOTE =
  'Only the oldest unpaid period per branch can be saved as draft. Complete or pay earlier periods in the queue first.';

export function payoutDueDraftDisabledNote(canDraft: boolean): string | null {
  return canDraft ? null : DRAFT_PAY_EARLIER_PERIOD_NOTE;
}

function formatUtcYmdLabel(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Turn payout-review API errors into admin-friendly copy. */
export function formatPayoutReviewDraftError(
  message: string,
  branchName?: string,
): string {
  const prefix = branchName ? `${formatBranchName(branchName)}: ` : '';
  const startMatch = message.match(/must start on (\d{4}-\d{2}-\d{2})/i);
  if (startMatch) {
    const startLabel = formatUtcYmdLabel(startMatch[1]);
    return `${prefix}You can only draft the next payout in line for this branch. The period must start on ${startLabel} (the day after the last payout request). ${DRAFT_PAY_EARLIER_PERIOD_NOTE}`;
  }
  if (/already paid/i.test(message)) {
    return `${prefix}This payout period is already paid and cannot be saved as draft again.`;
  }
  return prefix ? `${prefix}${message}` : message;
}

async function readPayoutsDueApiError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { message?: string };
    const detail = json.message ? `${res.status}: ${json.message}` : String(res.status);
    return `${fallback} (${detail})`;
  } catch {
    return `${fallback} (${res.status})`;
  }
}

export async function fetchBranchPayoutsDue(
  apiBase: string,
  params: FetchBranchPayoutsDueParams = {},
  signal?: AbortSignal,
): Promise<BranchPayoutsDuePage> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.max(1, params.limit ?? PAYOUTS_DUE_PAGE_SIZE);
  const search = params.search?.trim() ?? '';
  const storeId = params.storeId?.trim() ?? '';
  const from = params.from?.trim() ?? '';
  const to = params.to?.trim() ?? '';
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (search) qs.set('search', search);
  if (storeId) qs.set('storeId', storeId);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);

  const res = await fetch(`${apiBase}/admin/wallet/payouts-due?${qs}`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
    signal,
  });
  if (!res.ok) throw new Error(await readPayoutsDueApiError(res, 'Failed to load payouts due'));
  const json = await res.json();
  const data = (json.data ?? {}) as Partial<BranchPayoutsDuePage>;
  const items = Array.isArray(data.items) ? data.items : [];
  const total = typeof data.total === 'number' ? data.total : items.length;
  const allTotal = typeof data.allTotal === 'number' ? data.allTotal : total;
  const resolvedLimit = typeof data.limit === 'number' && data.limit > 0 ? data.limit : limit;
  const pages = Math.max(
    1,
    typeof data.pages === 'number' && data.pages > 0
      ? data.pages
      : Math.ceil(total / resolvedLimit) || 1,
  );
  return {
    items,
    total,
    allTotal,
    page: typeof data.page === 'number' && data.page > 0 ? data.page : page,
    limit: resolvedLimit,
    pages,
  };
}

function isPayoutsDuePage(value: unknown): value is BranchPayoutsDuePage {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as BranchPayoutsDuePage).items);
}

/** Drop a settled branch period from cached due lists (immediate UI update). */
export function removePaidBranchFromPayoutsDueCache(
  queryClient: QueryClient,
  meta: BranchPayoutCompletedMeta,
): void {
  queryClient.setQueriesData<BranchPayoutsDuePage | PayoutDueRow[]>(
    { queryKey: BRANCH_PAYOUTS_DUE_QUERY_KEY },
    (old) => {
      if (!old) return old;
      if (isPayoutsDuePage(old)) {
        const items = old.items.filter(
          (row) =>
            !(
              row.storeId === meta.storeId &&
              payoutPeriodMatches(row.periodFrom, row.periodTo, meta.periodFrom, meta.periodTo)
            ),
        );
        if (items.length === old.items.length) return old;
        const removed = old.items.length - items.length;
        return {
          ...old,
          items,
          total: Math.max(0, old.total - removed),
          allTotal: Math.max(0, old.allTotal - removed),
        };
      }
      if (!Array.isArray(old) || old.length === 0) return old;
      return old.filter(
        (row) =>
          !(
            row.storeId === meta.storeId &&
            payoutPeriodMatches(row.periodFrom, row.periodTo, meta.periodFrom, meta.periodTo)
          ),
      );
    },
  );
}

/** Invalidate and refetch due lists in the background (optimistic cache update is immediate). */
export function refreshBranchPayoutsDueQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: BRANCH_PAYOUTS_DUE_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: ['payout-due-net-preview'] });
  void queryClient.refetchQueries({ queryKey: BRANCH_PAYOUTS_DUE_QUERY_KEY, type: 'active' });
}
