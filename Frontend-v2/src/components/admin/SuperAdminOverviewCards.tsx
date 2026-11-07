'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Building2,
  ChevronRight,
  MoreHorizontal,
  ShoppingBag,
  Wallet,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, ReferenceLine, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  type ChartConfig,
} from '@/components/ui/chart';
import { ChartAreaSkeleton, DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import { type RevenueChannels } from '@/components/admin/BranchRevenueBreakdownDonut';
import { formatMoneyAmount } from '@/lib/receipt';
import { cn } from '@/lib/utils';

type MonthlyPoint = {
  month: string;
  revenue: number;
  orders?: number;
};

type Props = {
  periodLabel: string;
  periodRevenue?: number;
  periodRefundAmount?: number;
  revenueChannels?: RevenueChannels;
  deliveryRevenue?: number;
  periodOrders?: number;
  cancelledOrders?: number;
  onlineWalletBalance?: number;
  totalPayable?: number;
  monthlyOverview?: MonthlyPoint[];
  loading?: boolean;
  sparkLoading?: boolean;
};

const REVENUE_CHART_STROKE = '#2563EB';

const sparkConfig = {
  revenue: { label: 'Revenue', color: REVENUE_CHART_STROKE },
} satisfies ChartConfig;

const orderSparkConfig = {
  orders: { label: 'Orders', color: '#307ef2' },
} satisfies ChartConfig;

const CANCELLED_BAR_MOTIF = [22, 34, 42, 55, 68, 82, 100];

function pct(part: number, total: number) {
  if (total <= 0) return '0';
  return (Math.round((part / total) * 1000) / 10).toFixed(1);
}

function fmtWallet(cents: number) {
  return formatMoneyAmount(cents / 100);
}

function OverviewCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'super-admin-overview-card super-admin-overview-card--row card flex h-full min-w-0 flex-col overflow-hidden p-3.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

function RevenueChannelKpiCard({
  label,
  amount,
  loading,
}: {
  label: string;
  amount: string;
  loading?: boolean;
}) {
  return (
    <div
      className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm dark:border-navy-border/60 dark:bg-[var(--color-navy-card)]"
    >
      <p className="text-[0.78rem] font-semibold leading-[1.15] text-slate-950 dark:text-fg">
        {label}
      </p>
      <p className="mt-[0.28rem] truncate text-[1rem] font-bold tabular-nums leading-[1.15] text-slate-950 dark:text-fg">
        {loading ? <DashSkel className="h-4 w-28 max-w-full" /> : amount}
      </p>
    </div>
  );
}

function RevenueSummarySparkChart({
  data,
  loading,
  className,
}: {
  data: Array<{ month: string; revenue: number }>;
  loading?: boolean;
  className?: string;
}) {
  const hasData = data.some((point) => point.revenue > 0);

  return (
    <div className={cn('h-full w-full min-w-0', className)} aria-hidden>
      {loading ? (
        <ChartAreaSkeleton height={52} />
      ) : hasData ? (
        <ChartContainer
          config={sparkConfig}
          className="aspect-auto h-full w-full [&>.recharts-responsive-container]:h-full"
          initialDimension={{ width: 520, height: 56 }}
        >
          <AreaChart data={data} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fillSuperAdminRevenueSpark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={REVENUE_CHART_STROKE} stopOpacity={0.2} />
                <stop offset="100%" stopColor={REVENUE_CHART_STROKE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" hide />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            {data.map((point) => (
              <ReferenceLine
                key={point.month}
                x={point.month}
                stroke="rgba(148, 163, 184, 0.35)"
                strokeDasharray="4 6"
                strokeWidth={1}
              />
            ))}
            <Area
              dataKey="revenue"
              type="monotone"
              fill="url(#fillSuperAdminRevenueSpark)"
              stroke={REVENUE_CHART_STROKE}
              strokeWidth={3}
              dot={{ r: 4, fill: REVENUE_CHART_STROKE, stroke: '#ffffff', strokeWidth: 2 }}
              activeDot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      ) : null}
    </div>
  );
}

function RevenueSummaryCard({
  periodRevenue,
  pickupRevenue,
  deliveryRevenue,
  periodRefundAmount,
  sparkData,
  loading,
  sparkLoading,
}: {
  periodRevenue: number;
  pickupRevenue: number;
  deliveryRevenue: number;
  periodRefundAmount: number;
  sparkData: Array<{ month: string; revenue: number }>;
  loading?: boolean;
  sparkLoading?: boolean;
}) {
  const sparkBusy = sparkLoading ?? loading;
  return (
    <div
      className={cn(
        'super-admin-overview-card super-admin-overview-card--row super-admin-overview__card--wide',
        'card flex h-full min-w-0 flex-col overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-3.5 shadow-sm',
        'dark:border-navy-border/60 dark:bg-[var(--color-navy-card)]',
      )}
    >
      <div className="relative z-10 flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB] dark:bg-[rgba(48,126,242,0.12)] dark:text-[#307ef2]">
          <BarChart3 size={14} strokeWidth={2.3} aria-hidden />
        </div>
        <h2 className="text-[0.9rem] font-bold leading-[1.15] text-slate-950 dark:text-fg">
          Revenue Summary
        </h2>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 items-center gap-2">
          <p className="m-0 shrink-0 text-[1.7rem] font-extrabold tabular-nums leading-[1.05] tracking-[-0.03em] text-slate-950 dark:text-fg">
            {loading ? <DashSkel className="h-8 w-48 max-w-full" /> : formatMoneyAmount(periodRevenue)}
          </p>
          <div className="min-h-[3.25rem] min-w-0 flex-1">
            <RevenueSummarySparkChart data={sparkData} loading={sparkBusy} className="h-[3.25rem]" />
          </div>
        </div>

        <div className="mt-auto grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-3">
          <RevenueChannelKpiCard
            label="Pickup Revenue"
            amount={formatMoneyAmount(pickupRevenue)}
            loading={loading}
          />
          <RevenueChannelKpiCard
            label="Delivery Revenue"
            amount={formatMoneyAmount(deliveryRevenue)}
            loading={loading}
          />
          <RevenueChannelKpiCard
            label="Refund Amount"
            amount={formatMoneyAmount(periodRefundAmount)}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}

function OrdersSparkChart({
  data,
  loading,
}: {
  data: Array<{ month: string; orders: number }>;
  loading?: boolean;
}) {
  const hasData = data.some((point) => point.orders > 0);

  return (
    <div className="h-11 w-[68px] shrink-0" aria-hidden>
      {loading ? (
        <ChartAreaSkeleton height={44} />
      ) : hasData ? (
        <ChartContainer
          config={orderSparkConfig}
          className="aspect-auto h-full w-full [&>.recharts-responsive-container]:h-full"
          initialDimension={{ width: 68, height: 44 }}
        >
          <BarChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
            <Bar
              dataKey="orders"
              fill="#307ef2"
              radius={[2, 2, 0, 0]}
              maxBarSize={6}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      ) : null}
    </div>
  );
}

function DecorativeBarMotif({ color }: { color: string }) {
  return (
    <div className="flex h-11 w-[68px] shrink-0 items-end justify-end gap-[3px]" aria-hidden>
      {CANCELLED_BAR_MOTIF.map((height, index) => (
        <span
          key={index}
          className="w-[5px] rounded-t-[2px]"
          style={{
            height: `${height}%`,
            backgroundColor: color,
            opacity: 0.28 + index * 0.11,
          }}
        />
      ))}
    </div>
  );
}

function OverviewKpiCard({
  icon: Icon,
  title,
  tone,
  count,
  subtitle,
  subtitleClassName,
  chart,
  loading,
}: {
  icon: LucideIcon;
  title: string;
  tone: 'blue' | 'red';
  count: React.ReactNode;
  subtitle: React.ReactNode;
  subtitleClassName: string;
  chart: React.ReactNode;
  loading?: boolean;
}) {
  const toneClass =
    tone === 'blue'
      ? 'super-admin-overview-card__icon--blue'
      : 'super-admin-overview-card__icon--red';

  return (
    <OverviewCard>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-start gap-2">
          <div className={`super-admin-overview-card__icon ${toneClass}`}>
            <Icon size={14} strokeWidth={2.25} />
          </div>
          <span className="min-w-0 whitespace-pre-line text-[0.9rem] font-bold leading-[1.15] text-fg">
            {title}
          </span>
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <p className="text-[1.7rem] font-extrabold tabular-nums leading-[1.05] tracking-[-0.03em] text-fg">
              {loading ? <DashSkel className="h-8 w-16" /> : count}
            </p>
            <p className={cn('mt-1 text-[0.82rem] font-medium leading-[1.25]', subtitleClassName)}>
              {loading ? <DashSkel className="h-3 w-20" /> : subtitle}
            </p>
          </div>
          {chart}
        </div>
      </div>
    </OverviewCard>
  );
}

function WalletPayablesCard({
  onlineWalletBalance,
  totalPayable,
  loading,
}: {
  onlineWalletBalance?: number;
  totalPayable?: number;
  loading?: boolean;
}) {
  const walletValue =
    onlineWalletBalance != null ? fmtWallet(onlineWalletBalance) : '—';
  const payableValue = totalPayable != null ? fmtWallet(totalPayable) : '—';

  return (
    <div className="super-admin-overview-card super-admin-overview-card--wallet super-admin-overview__card--wide flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <Wallet
        aria-hidden
        size={96}
        strokeWidth={1}
        className="super-admin-overview-card__wallet-art pointer-events-none absolute -right-3 top-4"
      />
      <svg
        className="super-admin-overview-card__wallet-wave pointer-events-none absolute inset-x-0 bottom-0 h-[46%] w-full"
        viewBox="0 0 400 90"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M0 48C62 18 118 78 188 46C248 20 312 62 400 34V90H0Z"
          fill="rgba(255,255,255,0.07)"
        />
      </svg>

      <Link
        href="/admin/wallet"
        className="group relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-1.5 pt-3"
      >
        <div className="flex items-start justify-between">
          <div className="super-admin-overview-card__wallet-icon">
            <Wallet size={15} strokeWidth={2.25} />
          </div>
          <MoreHorizontal size={16} className="super-admin-overview-card__wallet-menu" />
        </div>

        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.9rem] font-medium leading-[1.2] !text-white/90">
              Wallet & Payables
            </p>
            <p className="mt-1.5 truncate text-[1.7rem] font-bold tabular-nums leading-[1.1] tracking-[-0.03em] !text-white">
              {loading ? <DashSkel className="h-7 w-36 max-w-full bg-white/20" /> : walletValue}
            </p>
            <p className="mt-1 text-[0.82rem] font-medium leading-[1.25] !text-white/65">
              Available wallet balance
            </p>
          </div>
          <span className="super-admin-overview-card__wallet-nav mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white transition-transform group-hover:translate-x-0.5">
            <ChevronRight size={16} strokeWidth={2.25} />
          </span>
        </div>
      </Link>

      <div className="super-admin-overview-card__wallet-divider relative z-10 mx-4" />

      <Link
        href="/admin/wallet"
        className="super-admin-overview-card__wallet-payables group relative z-10 mt-auto flex shrink-0 items-center gap-3 px-4 py-2"
      >
        <div className="super-admin-overview-card__wallet-pay-icon">
          <Building2 size={14} strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9rem] font-medium leading-[1.2] !text-white">Branch Payables</p>
          <p className="mt-1 truncate text-[1rem] font-bold tabular-nums leading-[1.15] !text-white">
            {loading ? <DashSkel className="h-4 w-28 max-w-full bg-white/20" /> : payableValue}
          </p>
        </div>
        <ChevronRight
          size={16}
          className="shrink-0 !text-white/70 transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </div>
  );
}

export default function SuperAdminOverviewCards({
  periodLabel,
  periodRevenue = 0,
  periodRefundAmount = 0,
  revenueChannels,
  deliveryRevenue = 0,
  periodOrders,
  cancelledOrders,
  onlineWalletBalance,
  totalPayable,
  monthlyOverview = [],
  loading,
  sparkLoading,
}: Props) {
  const sparkBusy = sparkLoading ?? loading;
  const pickupCash = revenueChannels?.pickupCash ?? 0;
  const pickupCard = revenueChannels?.pickupCard ?? 0;
  const pickupOnline = revenueChannels?.pickupOnline ?? 0;
  const pickupRevenue = pickupCash + pickupCard + pickupOnline;
  const cancelledPct =
    typeof cancelledOrders === 'number' && typeof periodOrders === 'number' && periodOrders > 0
      ? pct(cancelledOrders, periodOrders)
      : null;

  const sparkData = useMemo(
    () => monthlyOverview.map((point) => ({ month: point.month, revenue: point.revenue })),
    [monthlyOverview],
  );
  const orderSparkData = useMemo(
    () => monthlyOverview.map((point) => ({ month: point.month, orders: point.orders ?? 0 })),
    [monthlyOverview],
  );

  return (
    <div className="super-admin-overview">
      <div className="super-admin-overview__grid">
        <WalletPayablesCard
          onlineWalletBalance={onlineWalletBalance}
          totalPayable={totalPayable}
          loading={loading}
        />

        <RevenueSummaryCard
          periodRevenue={periodRevenue}
          pickupRevenue={pickupRevenue}
          deliveryRevenue={deliveryRevenue}
          periodRefundAmount={periodRefundAmount}
          sparkData={sparkData}
          loading={loading}
          sparkLoading={sparkBusy}
        />

        <Link href="/admin/orders" className="block h-full min-w-0">
          <OverviewKpiCard
            icon={ShoppingBag}
            title="Total Orders"
            tone="blue"
            count={periodOrders ?? '—'}
            subtitle={periodLabel}
            subtitleClassName="text-muted"
            loading={loading}
            chart={<OrdersSparkChart data={orderSparkData} loading={sparkBusy} />}
          />
        </Link>

        <Link href="/admin/orders" className="block h-full min-w-0">
          <OverviewKpiCard
            icon={XCircle}
            title="Cancelled Orders"
            tone="red"
            count={cancelledOrders ?? '—'}
            subtitle={cancelledPct != null ? `${cancelledPct}% of total` : periodLabel}
            subtitleClassName="font-medium text-red-500"
            loading={loading}
            chart={
              loading ? (
                <div className="h-11 w-[68px] shrink-0" aria-hidden>
                  <ChartAreaSkeleton height={44} />
                </div>
              ) : (
                <DecorativeBarMotif color="#ef4444" />
              )
            }
          />
        </Link>
      </div>
    </div>
  );
}
