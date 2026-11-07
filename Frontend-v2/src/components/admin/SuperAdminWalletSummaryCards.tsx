'use client';

import type { LucideIcon } from 'lucide-react';
import { RotateCcw, TrendingUp } from 'lucide-react';

import AllTimePaymentsCard from '@/components/admin/AllTimePaymentsCard';
import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import type { BranchWalletDashboard } from '@/components/admin/BranchWalletSummaryCards';
import { formatMoney } from '@/lib/receipt';
import { cn } from '@/lib/utils';

type Props = {
  dashboard: BranchWalletDashboard | null;
  loading?: boolean;
  className?: string;
  periodLabel?: string | null;
};

function centsToMoney(cents: number): string {
  return formatMoney(cents / 100);
}

function SummaryMetricCard({
  icon: Icon,
  tone,
  title,
  value,
  hint,
  loading,
}: {
  icon: LucideIcon;
  tone: 'blue' | 'red';
  title: string;
  value: string;
  hint: string;
  loading?: boolean;
}) {
  const iconClass =
    tone === 'blue'
      ? 'bg-[rgba(48,126,242,0.12)] text-[#307ef2]'
      : 'bg-[rgba(239,68,68,0.12)] text-[#dc2626]';

  return (
    <div className="super-admin-overview-card card flex h-full min-h-0 flex-col p-3.5">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            iconClass,
          )}
        >
          <Icon size={14} strokeWidth={2.25} />
        </div>
        <span className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
          {title}
        </span>
      </div>
      <p
        className="mt-3 text-[1.35rem] font-bold tabular-nums tracking-tight text-fg lg:text-[1.45rem]"
        title={loading ? undefined : value}
      >
        {loading ? <DashSkel className="h-7 w-[8.5rem] rounded-md" /> : value}
      </p>
      <p className="mt-auto pt-2 text-[11px] font-medium text-muted" title={loading ? undefined : hint}>
        {loading ? <DashSkel className="h-3 w-28 rounded" /> : hint}
      </p>
    </div>
  );
}

/** Super-admin wallet KPI row: earnings, wide payments breakdown, refunds. */
export default function SuperAdminWalletSummaryCards({
  dashboard,
  loading = false,
  className = 'mb-0',
  periodLabel = null,
}: Props) {
  const earnings = dashboard?.allTimeEarnings;
  const payments = dashboard?.allTimePayments;
  const earningsLabel = periodLabel ? 'Period Earnings' : 'All-Time Earnings';
  const earningsHint = periodLabel
    ? `Online earnings · ${periodLabel}`
    : 'Pickup online + Delivery online';
  const paymentsCaption = periodLabel
    ? `Approved payouts · ${periodLabel}`
    : 'Completed or approved payouts';
  const refundsHint = periodLabel
    ? `Retained refunds · ${periodLabel}`
    : 'Completed + rejected retained subtotals';

  const toBranchLkr = (payments?.toBranchCents ?? 0) / 100;
  const toPlatformLkr = (payments?.toPlatformCents ?? 0) / 100;
  const toDeliveryLkr = payments?.toDeliveryLkr ?? 0;
  const totalPaymentsLkr = toBranchLkr + toPlatformLkr + toDeliveryLkr;

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr] lg:items-stretch lg:h-[168px]',
        className,
      )}
      aria-busy={loading}
    >
      <SummaryMetricCard
        icon={TrendingUp}
        tone="blue"
        title={earningsLabel}
        value={earnings ? centsToMoney(earnings.total) : formatMoney(0)}
        hint={earningsHint}
        loading={loading}
      />
      <AllTimePaymentsCard
        variant="panel"
        loading={loading}
        className="sm:col-span-2 lg:col-span-1"
        title={periodLabel ? 'Period Payments' : 'All-Time Payments'}
        caption={paymentsCaption}
        totalValue={formatMoney(totalPaymentsLkr)}
        columns={[
          { label: 'Branch Payments', value: formatMoney(toBranchLkr), amount: toBranchLkr },
          { label: 'Platform Payments', value: formatMoney(toPlatformLkr), amount: toPlatformLkr },
          { label: 'Delivery Payments', value: formatMoney(toDeliveryLkr), amount: toDeliveryLkr },
        ]}
      />
      <SummaryMetricCard
        icon={RotateCcw}
        tone="red"
        title="Refunds"
        value={formatMoney(dashboard?.refundsLkr ?? 0)}
        hint={refundsHint}
        loading={loading}
      />
    </div>
  );
}
