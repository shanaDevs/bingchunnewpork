'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { adminAuthHeaders } from '@/lib/adminSession';
import { formatMoneyAmount } from '@/lib/receipt';
import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { cn } from '@/lib/utils';
import WalletWithdrawalModal from '@/components/admin/WalletWithdrawalModal';
import type { WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchPayoutPeriodNetPreview,
  resolvePayoutPeriodRowDisplayAmounts,
} from '@/components/admin/payoutPeriodRowAmounts';
import { syntheticPeriodViewWithdrawal } from '@/components/admin/payoutPeriodView';

export type PayoutPeriodStatus = 'PAID' | 'PENDING' | 'IN_PROGRESS';

export type PayoutPeriodRow = {
  key: string;
  periodFrom: string;
  periodTo: string;
  /** In-progress cycles: orders/summary run through this date (today). */
  summaryThrough?: string;
  status: PayoutPeriodStatus;
  amountCents: number;
  orderCount: number;
  breakdown?: unknown;
  withdrawal?: WithdrawalRow | null;
};

export type PayoutPeriodSort = 'newest' | 'oldest';

type Props = {
  storeId?: string;
  walletBalance: number;
  availableBalance: number;
  refreshSignal?: number;
  periodSort?: PayoutPeriodSort;
  highlightPeriod?: { periodFrom: string; periodTo: string } | null;
  /** Open the oldest unpaid period from the full list, ignoring the wallet date filter. */
  focusOldestPending?: boolean;
};

const AMOUNT_COLUMNS = [
  'Branch payout',
  'Customer convenience fee',
  'Net platform amount',
  'Delivery fee received',
] as const;

function statusLabel(status: PayoutPeriodStatus) {
  if (status === 'PAID') return 'Paid';
  if (status === 'IN_PROGRESS') return 'In progress';
  return 'Pending';
}

function statusBadgeClass(status: PayoutPeriodStatus) {
  if (status === 'PAID') return 'admin-status-badge--green';
  return 'admin-status-badge--amber';
}

function previewPeriodTo(row: PayoutPeriodRow) {
  return row.summaryThrough ?? row.periodTo;
}

function formatPayoutPeriodCell(row: PayoutPeriodRow) {
  if (row.status !== 'IN_PROGRESS') {
    return formatBiweeklyPeriodLabel(row.periodFrom, row.periodTo);
  }
  const through = row.summaryThrough ?? row.periodTo;
  return (
    <span className="flex flex-col gap-0.5">
      <span>{formatBiweeklyPeriodLabel(row.periodFrom, through)}</span>
      <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
        15-day cycle closes {row.periodTo}
      </span>
    </span>
  );
}

function asIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function toWithdrawalRow(raw: WithdrawalRow, fallbackStoreId?: string): WithdrawalRow {
  return {
    ...raw,
    storeId: raw.storeId ?? fallbackStoreId,
    periodFrom: asIsoDate(raw.periodFrom) ?? raw.periodFrom,
    periodTo: asIsoDate(raw.periodTo) ?? raw.periodTo,
    createdAt: asIsoDate(raw.createdAt) ?? raw.createdAt,
    reviewedAt: asIsoDate(raw.reviewedAt) ?? raw.reviewedAt,
    checkDate: asIsoDate(raw.checkDate) ?? raw.checkDate,
  };
}

export function payoutPeriodsQueryKey(storeId?: string) {
  return ['payout-periods', storeId ?? ''] as const;
}

export async function fetchPayoutPeriods(apiBase: string, storeId?: string): Promise<PayoutPeriodRow[]> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  const res = await fetch(`${apiBase}/admin/wallet/payout-periods${qs}`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load payout periods');
  const json = await res.json();
  return (json.data ?? []) as PayoutPeriodRow[];
}

function PayoutPeriodsTableSkeleton() {
  return (
    <div className="overflow-x-auto" aria-hidden>
      <table className="w-full min-w-[960px] text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="px-3 py-2.5 font-semibold">Payout Period</th>
            {AMOUNT_COLUMNS.map((label) => (
              <th key={label} className="px-3 py-2.5 text-right font-semibold">
                {label}
              </th>
            ))}
            <th className="px-3 py-2.5 font-semibold">Status</th>
            <th className="px-3 py-2.5 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, row) => (
            <tr key={row} className="border-b border-[var(--color-navy-border)]/70 last:border-b-0">
              <td className="px-3 py-3">
                <Skeleton className="h-3.5 w-44 bg-[var(--color-navy-light)]/70" />
              </td>
              {AMOUNT_COLUMNS.map((label) => (
                <td key={label} className="px-3 py-3 text-right">
                  <Skeleton className="ml-auto h-3.5 w-20 bg-[var(--color-navy-light)]/70" />
                </td>
              ))}
              <td className="px-3 py-3">
                <Skeleton className="h-5 w-16 rounded-full bg-[var(--color-navy-light)]/70" />
              </td>
              <td className="px-3 py-3 text-right">
                <Skeleton className="ml-auto h-7 w-14 rounded-lg bg-[var(--color-navy-light)]/70" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function periodToViewRow(row: PayoutPeriodRow, storeId?: string): {
  withdrawal: WithdrawalRow;
  viewPeriodOnly: boolean;
} {
  if (row.withdrawal) {
    return {
      withdrawal: toWithdrawalRow(row.withdrawal, storeId ?? row.withdrawal.storeId),
      viewPeriodOnly: false,
    };
  }

  return syntheticPeriodViewWithdrawal({
    key: row.key,
    periodFrom: row.periodFrom,
    periodTo: previewPeriodTo(row),
    amountCents: row.amountCents,
    storeId,
    breakdown: row.breakdown,
  });
}

function formatAmountCell(value: number) {
  return formatMoneyAmount(value);
}

function PayoutPeriodAmountCells({
  row,
  netPreviewData,
  previewLoading,
  previewPeriodTo: summaryTo,
}: {
  row: PayoutPeriodRow;
  netPreviewData?: Record<string, unknown>;
  previewLoading: boolean;
  previewPeriodTo: string;
}) {
  const needsPreview = !row.breakdown;
  const amounts = resolvePayoutPeriodRowDisplayAmounts({
    amountCents: row.amountCents,
    breakdown: row.breakdown,
    periodFrom: row.periodFrom,
    periodTo: summaryTo,
    netPreviewData: needsPreview ? netPreviewData : undefined,
  });

  const feeColumnsLoading = needsPreview && previewLoading;

  const netPlatformLkr = row.status === 'PAID' ? amounts.commissionLkr : null;
  const values = [
    amounts.branchReceives,
    amounts.orderConvenienceFeeLkr,
    netPlatformLkr,
    amounts.deliveryFee,
  ];

  return (
    <>
      {values.map((value, index) => (
        <td
          key={AMOUNT_COLUMNS[index]}
          className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--color-text)]"
        >
          {index === 2 && row.status !== 'PAID' ? (
            <span className="text-[var(--color-text-muted)]">—</span>
          ) : feeColumnsLoading && index > 0 ? (
            <Skeleton className="ml-auto inline-block h-3.5 w-16 bg-[var(--color-navy-light)]/70" />
          ) : (
            formatAmountCell(value ?? 0)
          )}
        </td>
      ))}
    </>
  );
}

function sortPayoutPeriodRows(rows: PayoutPeriodRow[], periodSort: PayoutPeriodSort) {
  return [...rows].sort((a, b) => {
    const byEnd = a.periodTo.localeCompare(b.periodTo);
    if (byEnd !== 0) return periodSort === 'oldest' ? byEnd : -byEnd;
    const byStart = a.periodFrom.localeCompare(b.periodFrom);
    return periodSort === 'oldest' ? byStart : -byStart;
  });
}

export default function BranchPayoutPeriodsSection({
  storeId,
  walletBalance,
  availableBalance,
  refreshSignal = 0,
  periodSort = 'newest',
  highlightPeriod = null,
  focusOldestPending = false,
}: Props) {
  const apiBase = getApiBaseUrl();
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  const openedOldestPending = useRef(false);
  const [viewRow, setViewRow] = useState<{
    withdrawal: WithdrawalRow;
    viewPeriodOnly: boolean;
  } | null>(null);

  const {
    data: payoutPeriodsData,
    isPending,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: payoutPeriodsQueryKey(storeId),
    queryFn: () => fetchPayoutPeriods(apiBase, storeId),
    enabled: Boolean(storeId),
  });

  const rows = payoutPeriodsData ?? [];
  /** Disabled query (no storeId) or first fetch — avoid empty state while wallet overview still loads. */
  const periodsLoading =
    !storeId || isPending || (isFetching && payoutPeriodsData === undefined);

  const rowsNeedingPreview = useMemo(
    () =>
      rows.filter((row) => !row.breakdown && row.periodFrom && previewPeriodTo(row)),
    [rows],
  );

  const previewQueries = useQueries({
    queries: rowsNeedingPreview.map((row) => ({
      queryKey: [
        'payout-period-net-preview',
        storeId,
        row.periodFrom,
        previewPeriodTo(row),
      ] as const,
      queryFn: () =>
        fetchPayoutPeriodNetPreview(apiBase, storeId!, row.periodFrom, previewPeriodTo(row)),
      enabled: Boolean(storeId),
      staleTime: 45_000,
    })),
  });

  const previewByKey = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    rowsNeedingPreview.forEach((row, index) => {
      const data = previewQueries[index]?.data;
      if (data) map.set(row.key, data);
    });
    return map;
  }, [rowsNeedingPreview, previewQueries]);

  const previewLoadingByKey = useMemo(() => {
    const map = new Map<string, boolean>();
    rowsNeedingPreview.forEach((row, index) => {
      map.set(row.key, previewQueries[index]?.isLoading ?? false);
    });
    return map;
  }, [rowsNeedingPreview, previewQueries]);

  useEffect(() => {
    if (refreshSignal > 0) void refetch();
  }, [refreshSignal, refetch]);

  const displayRows = useMemo(
    () => sortPayoutPeriodRows(rows, focusOldestPending ? 'oldest' : periodSort),
    [rows, periodSort, focusOldestPending],
  );

  const oldestPending = useMemo(
    () => (focusOldestPending ? displayRows.find((row) => row.status === 'PENDING') ?? null : null),
    [displayRows, focusOldestPending],
  );

  const activeHighlight = oldestPending
    ? { periodFrom: oldestPending.periodFrom, periodTo: oldestPending.periodTo }
    : highlightPeriod;

  useEffect(() => {
    openedOldestPending.current = false;
  }, [storeId]);

  useEffect(() => {
    if (!focusOldestPending || periodsLoading || openedOldestPending.current || !oldestPending) return;
    openedOldestPending.current = true;
    setViewRow(periodToViewRow(oldestPending, storeId));
  }, [focusOldestPending, periodsLoading, oldestPending, storeId]);

  useEffect(() => {
    if (!activeHighlight || periodsLoading) return;
    const el = highlightRowRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeHighlight?.periodFrom, activeHighlight?.periodTo, periodsLoading, displayRows.length]);

  return (
    <div className="mb-7 overflow-hidden rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-card)]">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-navy-border)] px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">15-Day Payout Periods</h3>
        <span className="text-xs text-[var(--color-text-muted)]">
          View only · current and completed cycles · amounts in LKR
        </span>
      </div>

      {periodsLoading && <PayoutPeriodsTableSkeleton />}

      {!periodsLoading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-brand-subtle)] text-[var(--color-brand)]">
            <CalendarRange size={28} />
          </div>
          <p className="text-base font-semibold text-[var(--color-text)]">No payout periods yet</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--color-text-muted)]">
            Your current 15-day cycle and completed cycles appear here for review before payout.
          </p>
        </div>
      )}

      {!periodsLoading && displayRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-3 py-2.5 font-semibold">Payout Period</th>
                {AMOUNT_COLUMNS.map((label) => (
                  <th key={label} className="px-3 py-2.5 text-right font-semibold">
                    {label}
                  </th>
                ))}
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                const highlighted =
                  activeHighlight != null &&
                  row.periodFrom === activeHighlight.periodFrom &&
                  row.periodTo === activeHighlight.periodTo;
                return (
                <tr
                  key={row.key}
                  ref={highlighted ? highlightRowRef : undefined}
                  className={cn(
                    'border-b border-[var(--color-navy-border)]/70 last:border-b-0 hover:bg-[var(--color-input-bg)]/40',
                    highlighted && 'bg-[var(--color-brand-subtle)]/40 ring-1 ring-inset ring-[var(--color-brand)]/30',
                  )}
                >
                  <td className="px-3 py-3 whitespace-nowrap text-[var(--color-text)]">
                    {formatPayoutPeriodCell(row)}
                  </td>
                  <PayoutPeriodAmountCells
                    row={row}
                    netPreviewData={previewByKey.get(row.key)}
                    previewLoading={previewLoadingByKey.get(row.key) ?? false}
                    previewPeriodTo={previewPeriodTo(row)}
                  />
                  <td className="px-3 py-3">
                    <span className={cn('admin-status-badge', statusBadgeClass(row.status))}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setViewRow(periodToViewRow(row, storeId))}
                      className={cn(
                        'inline-flex items-center rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5',
                        'text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)]',
                      )}
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}

      <WalletWithdrawalModal
        open={!!viewRow}
        onClose={() => setViewRow(null)}
        viewWithdrawal={viewRow?.withdrawal ?? null}
        viewPeriodOnly={viewRow?.viewPeriodOnly ?? false}
        walletBalance={walletBalance}
        availableBalance={availableBalance}
        storeId={storeId ?? viewRow?.withdrawal.storeId}
        apiBase={apiBase}
        onSubmitted={() => undefined}
        showGatewayFees={false}
      />
    </div>
  );
}
