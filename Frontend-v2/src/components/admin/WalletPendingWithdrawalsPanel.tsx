'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Wallet,
} from 'lucide-react';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import {
  parseWithdrawalBreakdown,
  resolvePeriodNetLkrFromBreakdown,
} from '@/components/admin/settlementTypes';
import { cn } from '@/lib/utils';
import type { WithdrawalRow } from './WalletWithdrawalTable';

type Props = {
  rows: WithdrawalRow[];
  loading?: boolean;
  storeNames: Record<string, string>;
  /** System online wallet balance in cents (sum of store wallet balances). */
  onlineWalletBalance: number;
  /** Opens the existing detailed payout breakdown / approve flow. */
  onViewMore: (row: WithdrawalRow) => void;
};

type BalanceTone = 'green' | 'amber' | 'red';

function balanceTone(remainingCents: number, totalCents: number): BalanceTone {
  if (remainingCents <= 0) return 'red';
  if (totalCents > 0 && remainingCents / totalCents < 0.2) return 'amber';
  return 'green';
}

function toneClasses(tone: BalanceTone) {
  switch (tone) {
    case 'red':
      return { value: 'text-red-400' };
    case 'amber':
      return { value: 'text-amber-400' };
    default:
      return { value: 'text-emerald-400' };
  }
}

function SummaryAmount({
  amount,
  className,
}: {
  amount: number;
  className?: string;
}) {
  return (
    <p className={cn('font-bold tabular-nums whitespace-nowrap', className)}>
      <span className="mr-1 align-baseline text-[11px] font-semibold opacity-70">LKR</span>
      <span className="text-xl">{formatMoneyAmount(amount)}</span>
    </p>
  );
}

function formatPeriod(row: WithdrawalRow) {
  if (!row.periodFrom || !row.periodTo) return '—';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-LK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  return `${fmt(row.periodFrom)} – ${fmt(row.periodTo)}`;
}

function branchLabel(row: WithdrawalRow, storeNames: Record<string, string>) {
  if (!row.storeId) return 'Branch';
  const name = storeNames[row.storeId] ?? row.storeId;
  return name.replace(/^Bing Chun\s*-\s*/i, '');
}

export default function WalletPendingWithdrawalsPanel({
  rows,
  loading,
  storeNames,
  onlineWalletBalance,
  onViewMore,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const count = rows.length;

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) =>
      current && rows.some((row) => row.id === current) ? current : rows[0].id,
    );
  }, [rows]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null,
    [rows, selectedId],
  );

  const selectedBranchName = selectedRow ? branchLabel(selectedRow, storeNames) : null;
  const selectedAmountCents = selectedRow?.amount ?? 0;
  const afterSelectedCents = onlineWalletBalance - selectedAmountCents;
  const afterSelectedTone = balanceTone(afterSelectedCents, onlineWalletBalance);
  const queueTotalCents = rows.reduce((sum, row) => sum + row.amount, 0);
  const afterQueueCents = onlineWalletBalance - queueTotalCents;
  const afterQueueTone = balanceTone(afterQueueCents, onlineWalletBalance);
  const afterQueueColors = toneClasses(afterQueueTone);
  const afterSelectedColors = toneClasses(afterSelectedTone);

  return (
    <div className="space-y-5">
      {count > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0 rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-card)] px-4 py-3">
            <div className="mb-1 flex items-center gap-1.5">
              <Wallet size={12} className="text-[var(--color-brand)]" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Available online wallet
              </p>
            </div>
            <SummaryAmount amount={onlineWalletBalance / 100} />
          </div>

          <div
            className={cn(
              'min-w-0 rounded-xl border px-4 py-3',
              queueTotalCents > 0
                ? 'border-[var(--color-brand)]/40 bg-[var(--color-brand-subtle)]/30'
                : 'border-[var(--color-navy-border)] bg-[var(--color-card)]',
            )}
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Total requested payouts
            </p>
            <SummaryAmount amount={queueTotalCents / 100} />
          </div>

          <div className="min-w-0 rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-card)] px-4 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Balance after all requests
            </p>
            <SummaryAmount amount={afterQueueCents / 100} className={afterQueueColors.value} />
            {afterQueueTone === 'red' && (
              <p className="mt-1 text-[10px] font-medium text-red-400">
                Would empty / overdraw wallet
              </p>
            )}
            {afterQueueTone === 'amber' && (
              <p className="mt-1 text-[10px] font-medium text-amber-400">
                Low balance after all requests
              </p>
            )}
          </div>

          <div className="min-w-0 rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-card)] px-4 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Balance after selected request
            </p>
            <SummaryAmount
              amount={afterSelectedCents / 100}
              className={afterSelectedColors.value}
            />
            {selectedRow && (
              <p className="mt-1 truncate text-[10px] font-medium text-[var(--color-brand)]">
                {selectedBranchName}: <span className="opacity-80">-LKR</span>{' '}
                {formatMoneyAmount(selectedAmountCents / 100)}
              </p>
            )}
            {afterSelectedTone === 'red' && (
              <p className="mt-1 text-[10px] font-medium text-red-400">
                Would empty / overdraw wallet
              </p>
            )}
            {afterSelectedTone === 'amber' && (
              <p className="mt-1 text-[10px] font-medium text-amber-400">
                Low balance after this payout
              </p>
            )}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-card)]">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-text-muted)]">
            <Loader2 size={18} className="animate-spin text-[var(--color-brand)]" />
            Loading requests…
          </div>
        )}

        {!loading && count === 0 && (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle size={28} />
            </div>
            <p className="text-base font-semibold text-[var(--color-text)]">All caught up</p>
            <p className="mt-1 max-w-sm text-sm text-[var(--color-text-muted)]">
              New payout requests from branches will appear here for approval.
            </p>
          </div>
        )}

        {!loading && count > 0 && (
          <>
            <div className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-navy-border)] px-4 py-3 sm:px-5">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">
                Branch Admin Pending Requests
              </h3>
              <span className="text-xs text-[var(--color-text-muted)]">
                {count} request{count === 1 ? '' : 's'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    <th className="w-10 px-3 py-2.5" aria-label="Select" />
                    <th className="px-3 py-2.5 font-semibold">Branch</th>
                    <th className="px-3 py-2.5 font-semibold">Period</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Requested</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Net Earnings</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Orders</th>
                    <th className="px-3 py-2.5 font-semibold">Submitted</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const selected = row.id === (selectedId ?? rows[0]?.id);
                    const breakdown = parseWithdrawalBreakdown(row.breakdown);
                    const netLkr = breakdown
                      ? resolvePeriodNetLkrFromBreakdown(breakdown)
                      : null;

                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        className={cn(
                          'cursor-pointer border-b border-[var(--color-navy-border)]/70 last:border-b-0 transition-colors',
                          selected
                            ? 'bg-[var(--color-brand-subtle)]'
                            : 'hover:bg-[var(--color-input-bg)]/40',
                        )}
                      >
                        <td className="px-3 py-3">
                          <div
                            className={cn(
                              'flex h-4 w-4 items-center justify-center rounded-full border-2',
                              selected
                                ? 'border-[var(--color-brand,#307ef2)] bg-[var(--color-brand,#307ef2)]'
                                : 'border-[var(--color-navy-border)]',
                            )}
                            aria-hidden
                          >
                            {selected && (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-medium text-[var(--color-text)]">
                          {branchLabel(row, storeNames)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-[var(--color-text-muted)]">
                          {formatPeriod(row)}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--color-text)]">
                          {formatMoney(row.amount / 100)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text)]">
                          {netLkr != null ? formatMoney(netLkr) : '—'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text)]">
                          {breakdown?.orderCount ?? '—'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-[var(--color-text-muted)]">
                          {new Date(row.createdAt).toLocaleString('en-LK', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-3 py-3">
                          <span className="admin-status-badge admin-status-badge--md admin-status-badge--amber">
                            Pending
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewMore(row);
                            }}
                            className="inline-flex items-center rounded-lg border border-[var(--color-brand)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand-subtle)]"
                          >
                            View More
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2 border-t border-amber-500/25 bg-amber-500/5 px-4 py-3 sm:px-5">
              <AlertCircle size={14} className="shrink-0 text-amber-400" />
              <p className="text-xs text-[var(--color-text-muted)]">
                Select a request to preview wallet impact. Use View More to review the full payout
                breakdown.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
