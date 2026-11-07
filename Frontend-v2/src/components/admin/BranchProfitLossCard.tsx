'use client';

import { ShoppingBag, TrendingUp } from 'lucide-react';

import { formatMoney } from '@/lib/receipt';

export type SalesBreakdownLine = {
  label: string;
  amount: number;
};

type Props = {
  lines: SalesBreakdownLine[];
  grossSales: number;
  totalOrders: number;
  periodLabel: string;
  loading?: boolean;
};

function formatPeriodBadge(label: string) {
  if (label === 'Today') return 'TODAY';
  if (label === 'This Month') {
    return new Date().toLocaleString('en-LK', { month: 'long', year: 'numeric' }).toUpperCase();
  }
  if (label === 'This Year') {
    return String(new Date().getFullYear());
  }
  return label.toUpperCase();
}

function LineRow({
  label,
  amount,
  loading,
}: {
  label: string;
  amount: number;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted">
        <span className="shrink-0 text-base font-bold text-brand">+</span>
        <span className="truncate">{label}</span>
      </div>
      <p className="shrink-0 text-right text-sm font-bold tabular-nums text-fg">
        {loading ? '…' : formatMoney(amount)}
      </p>
    </div>
  );
}

export default function BranchProfitLossCard({
  lines,
  grossSales,
  totalOrders,
  periodLabel,
  loading,
}: Props) {
  const avgOrderValue = totalOrders > 0 ? Math.round(grossSales / totalOrders) : 0;

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl border p-5 shadow-sm"
      style={{
        borderColor: 'rgba(48,126,242,0.35)',
        background:
          'linear-gradient(145deg, rgba(48,126,242,0.08) 0%, rgba(255,255,255,0.02) 100%)',
      }}
    >
      <div className="mb-5 flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-bold text-fg">Sales</h2>
        <span className="text-muted">·</span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
          {formatPeriodBadge(periodLabel)}
        </span>
      </div>

      <div className="flex flex-1 flex-col rounded-xl border border-navy-border/70 bg-surface-raised/80 p-4">
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand">Revenue breakdown</p>
          {lines.length === 0 ? (
            <p className="text-sm text-muted">{loading ? '…' : 'No sales in this period'}</p>
          ) : (
            lines.map((line) => (
              <LineRow key={line.label} label={line.label} amount={line.amount} loading={loading} />
            ))
          )}
        </div>

        <div className="my-4 border-t border-navy-border/70" />

        <div className="mt-auto space-y-2">
          <p className="text-base font-bold text-fg">Gross sales</p>
          <p className="break-words text-[clamp(1.5rem,5vw,2.25rem)] font-extrabold leading-none tracking-tight tabular-nums text-brand">
            {loading ? '…' : formatMoney(grossSales)}
          </p>
          {!loading && (
            <p className="text-[11px] font-bold tabular-nums text-muted">
              {totalOrders.toLocaleString()} orders · {formatMoney(avgOrderValue)} avg per order
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-brand/10 px-4 py-3">
        <TrendingUp size={18} className="shrink-0 text-brand" />
        <span className="text-xs font-extrabold uppercase tracking-wide text-brand">
          {loading ? '…' : `${totalOrders.toLocaleString()} orders this period`}
        </span>
        <ShoppingBag size={16} className="shrink-0 text-brand/70" aria-hidden />
      </div>
    </div>
  );
}
