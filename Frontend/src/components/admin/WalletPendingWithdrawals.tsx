'use client';

import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { formatStoredPayoutPeriodLabel } from '@/components/admin/payoutSecondCycleDisplayRange';
import { formatMoney } from '@/lib/receipt';
import { parseWithdrawalBreakdown } from '@/components/admin/settlementTypes';
import WithdrawalBreakdownDisplay from '@/components/admin/WithdrawalBreakdownDisplay';
import type { WithdrawalRow } from './WalletWithdrawalTable';

type Props = {
  rows: WithdrawalRow[];
  loading?: boolean;
  storeNames: Record<string, string>;
  onApprove: (row: WithdrawalRow) => void;
  onReject: (row: WithdrawalRow) => void;
  actingId?: string | null;
};

export default function WalletPendingWithdrawals({
  rows,
  loading,
  storeNames,
  onApprove,
  onReject,
  actingId,
}: Props) {
  if (!loading && rows.length === 0) return null;

  return (
    <div className="card mb-5 overflow-hidden border-amber-500/30">
      <div className="flex items-center gap-2 border-b border-[var(--color-navy-border)] bg-amber-500/10 px-5 py-4">
        <AlertCircle size={18} className="text-amber-400" />
        <div>
          <h2 className="text-sm font-semibold text-fg">Pending Withdrawal Requests</h2>
          <p className="text-xs text-muted">Approve or reject branch payout requests</p>
        </div>
      </div>

      <div className="divide-y divide-[var(--color-navy-border)]">
        {loading && (
          <p className="px-5 py-8 text-center text-sm text-muted">Loading pending requests…</p>
        )}
        {rows.map((row) => {
          const breakdown = parseWithdrawalBreakdown(row.breakdown);
          return (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
          >
            <div className="min-w-0">
              <p className="font-medium text-fg">
                {row.storeId ? storeNames[row.storeId] ?? row.storeId : 'Branch'}
              </p>
              <p className="text-lg font-bold text-fg">{formatMoney(row.amount / 100)}</p>
              {row.periodFrom && row.periodTo && (
                <p className="mt-1 text-xs text-muted">
                  Period: {formatStoredPayoutPeriodLabel(row)}
                </p>
              )}
              {breakdown && <WithdrawalBreakdownDisplay breakdown={breakdown} variant="compact" />}
              {row.remarks && (
                <p className="mt-1 text-xs text-muted">{row.remarks}</p>
              )}
              <p className="mt-1 text-[10px] text-muted">
                {new Date(row.createdAt).toLocaleString('en-LK')}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => onApprove(row)}
                disabled={actingId === row.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <CheckCircle size={14} />
                Approve
              </button>
              <button
                type="button"
                onClick={() => onReject(row)}
                disabled={actingId === row.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/50 px-3 py-2 text-xs font-semibold text-red-400 disabled:opacity-50"
              >
                <XCircle size={14} />
                Reject
              </button>
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}
