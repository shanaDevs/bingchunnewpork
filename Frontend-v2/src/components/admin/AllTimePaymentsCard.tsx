'use client';

import type { LucideIcon } from 'lucide-react';
import { ArrowDownCircle, Building2, Landmark, Truck } from 'lucide-react';
import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import { KPI_BOLD } from '@/lib/dashboardTheme';
import { formatMoney } from '@/lib/receipt';
import { cn } from '@/lib/utils';

type PaymentColumn = {
  label: string;
  value: string;
  amount?: number;
  icon?: LucideIcon;
};

type Props = {
  columns: PaymentColumn[];
  loading?: boolean;
  title?: string;
  caption?: string;
  className?: string;
  variant?: 'bold' | 'panel';
  totalValue?: string;
};

const DEFAULT_CAPTION = 'Completed or approved payouts';
const PANEL_ICONS = [Building2, Landmark, Truck] as const;

function paymentShare(amount: number | undefined, total: number) {
  if (!Number.isFinite(amount) || total <= 0) return 0;
  return Math.min(100, Math.max(0, ((amount ?? 0) / total) * 100));
}

function formatShare(percent: number) {
  return `${percent.toFixed(1)}% of total`;
}

export default function AllTimePaymentsCard({
  columns,
  loading = false,
  title = 'All-Time Payments',
  caption = DEFAULT_CAPTION,
  className,
  variant = 'bold',
  totalValue,
}: Props) {
  if (variant === 'panel') {
    const totalAmount = columns.reduce((sum, column) => sum + (column.amount ?? 0), 0);
    const resolvedTotal = totalValue ?? formatMoney(totalAmount);

    return (
      <div
        className={cn(
          'super-admin-overview-card card flex h-full min-h-0 flex-col p-3.5',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(48,126,242,0.12)] text-[#307ef2]">
              <ArrowDownCircle size={14} strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                {title}
              </p>
              <p className="mt-0.5 text-[11px] text-muted" title={caption}>
                {caption}
              </p>
            </div>
          </div>
          <p className="shrink-0 text-[1.25rem] font-bold tabular-nums tracking-tight text-fg">
            {loading ? <DashSkel className="h-6 w-28 rounded-md" /> : resolvedTotal}
          </p>
        </div>

        <div
          className={cn(
            'mt-3 grid min-h-0 flex-1 items-end gap-3',
            columns.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3',
          )}
        >
          {columns.map((column, index) => {
            const Icon = column.icon ?? PANEL_ICONS[index] ?? Building2;
            const share = paymentShare(column.amount, totalAmount);
            return (
              <div key={column.label} className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(48,126,242,0.12)] text-[#307ef2]">
                    <Icon size={13} strokeWidth={2.25} />
                  </div>
                  <p className="truncate text-[11px] font-medium text-muted" title={column.label}>
                    {column.label}
                  </p>
                </div>
                <p
                  className="mt-1.5 truncate text-[13px] font-bold tabular-nums tracking-tight text-fg"
                  title={loading ? undefined : column.value}
                >
                  {loading ? <DashSkel className="h-4 w-24 rounded" /> : column.value}
                </p>
                <p className="mt-0.5 text-[10px] font-medium text-muted">
                  {loading ? <DashSkel className="h-3 w-16 rounded" /> : formatShare(share)}
                </p>
                {loading ? (
                  <DashSkel className="mt-1.5 h-1 w-full rounded-full" />
                ) : (
                  <div
                    className="mt-1.5 h-1 overflow-hidden rounded-full bg-[rgba(48,126,242,0.12)]"
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full bg-[#307ef2]"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const bold = KPI_BOLD.orange;

  return (
    <div
      className={cn(
        'admin-dash-stat relative flex h-full min-h-[10.5rem] flex-col overflow-hidden rounded-2xl border-0 p-5 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg',
        className,
      )}
      style={{ background: bold.bg, color: bold.fg }}
    >
      <div className="relative z-[1] flex items-start gap-2">
        <div
          className="admin-dash-stat__icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: bold.iconBg, color: bold.iconColor }}
        >
          <ArrowDownCircle size={17} strokeWidth={2.25} />
        </div>
        <p
          className="min-w-0 pt-0.5 text-[11px] font-bold uppercase leading-tight tracking-[0.08em] line-clamp-2"
          style={{ color: bold.label }}
        >
          {title}
        </p>
      </div>

      <div
        className={cn(
          'relative z-[1] mt-4 grid flex-1 items-start gap-0',
          columns.length <= 2 ? 'grid-cols-2' : 'grid-cols-3',
        )}
      >
        {columns.map((column, index) => (
          <div
            key={column.label}
            className={cn(
              'min-w-0 px-2 first:pl-0 last:pr-0',
              index > 0 && 'border-l border-white/20',
            )}
          >
            <p
              className="truncate text-[10px] font-bold uppercase leading-snug tracking-[0.04em]"
              style={{ color: bold.muted }}
              title={column.label}
            >
              {column.label}
            </p>
            <p
              className="mt-1 truncate text-[clamp(0.75rem,1.1vw,0.95rem)] font-extrabold leading-none tracking-tight tabular-nums"
              style={{ color: bold.fg }}
              title={column.value}
            >
              {loading ? '…' : column.value}
            </p>
          </div>
        ))}
      </div>

      <p
        className="relative z-[1] mt-3 truncate text-[10px] font-semibold leading-snug"
        style={{ color: bold.muted }}
        title={caption}
      >
        {caption}
      </p>

      <ArrowDownCircle
        size={76}
        className="pointer-events-none absolute bottom-1.5 right-1.5 opacity-[0.14]"
        strokeWidth={1.15}
        style={{ color: bold.iconColor }}
        aria-hidden
      />
    </div>
  );
}
