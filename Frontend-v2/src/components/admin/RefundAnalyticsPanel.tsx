'use client';

import { adminAuthHeaders } from '@/lib/adminSession';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DateRange } from 'react-day-picker';
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  LineChart,
  Package,
  RefreshCw,
  ShoppingBag,
  Truck,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import DashboardPeriodFilter, {
  formatDashboardPeriodLabel,
  orderDateRange,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import RefundBreakdownVerticalBarChart from '@/components/admin/RefundBreakdownVerticalBarChart';
import RefundDailyTrendChart from '@/components/admin/RefundDailyTrendChart';
import RefundDistributionDonutChart, {
  type RefundDistributionPoint,
} from '@/components/admin/RefundDistributionDonutChart';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import ProductImage from '@/components/ui/ProductImage';
import { getApiBaseUrl } from '@/lib/apiBase';
import { KPI_BOLD } from '@/lib/dashboardTheme';
import { formatMoney } from '@/lib/receipt';
import { refundChartColor, withRefundChartFill } from '@/lib/refundChartPalette';
import { shortBranchName } from '@/lib/branchName';

export type RefundAnalyticsPayload = {
  summary: {
    totalCount: number;
    totalRefundAmountLkr: number;
    avgRefundAmountLkr: number;
    avgRefundPercentage: number | null;
    completeCount: number;
    rejectedCount: number;
    pendingCount: number;
    completeRatePercent: number;
    rejectionRatePercent: number;
  };
  byCancelAtStatus: Array<{
    status: string;
    label: string;
    count: number;
    percent: number;
    fill: string;
  }>;
  byReason: Array<{
    reason: string;
    label: string;
    count: number;
    percent: number;
    fill: string;
  }>;
  byRequestType: Array<{
    type: string;
    label: string;
    count: number;
    percent: number;
    fill: string;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    imageUrl?: string | null;
    refundCount: number;
    percent: number;
    refundAmountLkr: number;
  }>;
  dailyTrend: Array<{ date: string; count: number; amountLkr: number }>;
  byOrderMode: Array<{ mode: string; label: string; count: number; percent: number }>;
  avgProcessingHours: number | null;
};

type Props = {
  showBranchFilter?: boolean;
};

async function fetchRefundAnalytics(endpoint: string): Promise<RefundAnalyticsPayload> {
    const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json.data as RefundAnalyticsPayload;
}

function DistributionRankList({
  items,
  loading,
  emptyLabel,
}: {
  items: Array<{ label: string; count: number; percent: number; fill?: string }>;
  loading?: boolean;
  emptyLabel?: string;
}) {
  if (loading) {
    return (
      <div className="space-y-3 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">{emptyLabel ?? 'No data'}</p>;
  }

  const maxCount = Math.max(...items.map((item) => item.count), 1);

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-fg">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {item.count} · {item.percent}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 8 : 0)}%`,
                backgroundColor: item.fill ?? refundChartColor(index),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function BreakdownCard({
  title,
  description,
  items,
  chartData,
  loading,
  emptyLabel,
}: {
  title: string;
  description: string;
  items: Array<{ label: string; count: number; percent: number; fill?: string }>;
  chartData: RefundDistributionPoint[];
  loading?: boolean;
  emptyLabel: string;
}) {
  const themedItems = items.map((item, index) => ({
    ...item,
    fill: refundChartColor(index),
  }));

  return (
    <div className="card min-w-0 overflow-hidden p-5">
      <h2 className="text-sm font-semibold text-fg mb-1">{title}</h2>
      <p className="text-xs text-muted mb-4">{description}</p>
      <div className="flex min-w-0 flex-col items-stretch gap-6 2xl:flex-row 2xl:items-start">
        <div className="flex shrink-0 justify-center 2xl:justify-start">
          <RefundDistributionDonutChart
            data={chartData}
            loading={loading}
            emptyLabel={emptyLabel}
            hideLegend
          />
        </div>
        <div className="min-w-0 flex-1">
          <DistributionRankList
            items={themedItems}
            loading={loading}
            emptyLabel={emptyLabel}
          />
        </div>
      </div>
    </div>
  );
}

function toChartPoints<T extends { label: string; count: number; percent: number }>(
  rows: T[],
  keyOf: (row: T, index: number) => string,
): RefundDistributionPoint[] {
  return withRefundChartFill(rows, keyOf).map((row) => ({
    key: row.key,
    label: row.label,
    value: row.count,
    percent: row.percent,
    fill: row.fill,
  }));
}

function formatProcessingHours(hours: number | null | undefined) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

function RefundSummaryBlueCard({
  summary,
  avgProcessingHours,
  loading,
  className = '',
}: {
  summary: RefundAnalyticsPayload['summary'] | undefined;
  avgProcessingHours: number | null | undefined;
  loading?: boolean;
  className?: string;
}) {
  const blue = KPI_BOLD.blue;

  const tiles = [
    {
      key: 'total',
      label: 'Total refunds',
      icon: BarChart3,
      value: summary ? String(summary.totalCount) : '—',
      detail: 'Requests in period',
    },
    {
      key: 'completion',
      label: 'Completion rate',
      icon: CheckCircle2,
      value: summary ? `${summary.completeRatePercent}%` : '—',
      detail: summary
        ? `${summary.completeCount} complete · ${summary.rejectedCount} rejected`
        : 'No data',
    },
    {
      key: 'rejection',
      label: 'Rejection rate',
      icon: XCircle,
      value: summary ? `${summary.rejectionRatePercent}%` : '—',
      detail: summary
        ? `${summary.rejectedCount} rejected · ${summary.pendingCount} pending`
        : 'No data',
    },
    {
      key: 'processing',
      label: 'Avg processing',
      icon: Clock3,
      value: formatProcessingHours(avgProcessingHours),
      detail: 'Received to complete or reject',
    },
  ] as const;

  return (
    <div
      className={`admin-dash-stat admin-dash-stat--compact relative flex min-h-[6.5rem] min-w-0 flex-col overflow-hidden rounded-2xl border-0 p-3.5 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg col-span-2 ${className}`}
      style={{ background: blue.bg, color: blue.fg }}
    >
      <div className="relative z-[1] grid h-full grid-cols-2 gap-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.key}
              className="flex min-w-0 flex-col justify-center rounded-xl px-2 py-1.5"
              style={{ background: blue.badgeBg }}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                  style={{ background: blue.iconBg, color: blue.iconColor }}
                >
                  <Icon size={12} strokeWidth={2.25} />
                </div>
                <p
                  className="truncate text-[9px] font-bold uppercase tracking-[0.06em]"
                  style={{ color: blue.label }}
                >
                  {tile.label}
                </p>
              </div>
              {loading ? (
                <div
                  className="h-7 animate-pulse rounded-lg"
                  style={{ background: blue.iconBg }}
                />
              ) : (
                <>
                  <p
                    className="text-lg font-extrabold tabular-nums leading-none"
                    style={{ color: blue.fg }}
                  >
                    {tile.value}
                  </p>
                  <p
                    className="mt-1 truncate text-[10px]"
                    style={{ color: blue.muted }}
                    title={tile.detail}
                  >
                    {tile.detail}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
      <BarChart3
        size={52}
        className="pointer-events-none absolute bottom-1.5 right-1.5 opacity-[0.14]"
        strokeWidth={1.15}
        style={{ color: blue.iconColor }}
      />
    </div>
  );
}

function RefundAmountHalf({
  label,
  value,
  icon: Icon,
  theme,
  loading,
  hint,
  watermark: Watermark,
  bordered,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  theme: (typeof KPI_BOLD)[keyof typeof KPI_BOLD];
  loading?: boolean;
  hint?: string;
  watermark: LucideIcon;
  bordered?: boolean;
}) {
  return (
    <div
      className={`admin-dash-stat admin-dash-stat--compact relative flex min-h-[6.5rem] min-w-0 flex-col gap-3 overflow-hidden p-3.5 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg ${bordered ? 'border-r border-white/20' : ''}`}
      style={{ background: theme.bg, color: theme.fg }}
    >
      <div className="relative z-[1] flex items-start gap-2">
        <div
          className="admin-dash-stat__icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: theme.iconBg, color: theme.iconColor }}
        >
          <Icon size={15} strokeWidth={2.25} />
        </div>
        <p
          className="min-w-0 flex-1 truncate pt-0.5 text-[10px] font-bold uppercase leading-tight tracking-[0.06em]"
          style={{ color: theme.label }}
          title={label}
        >
          {label}
        </p>
      </div>

      <div className="relative z-[1] flex min-h-0 flex-1 items-center">
        {loading ? (
          <div className="h-7 w-24 animate-pulse rounded-lg" style={{ background: theme.iconBg }} />
        ) : (
          <p
            className="text-[clamp(1rem,1.35vw,1.25rem)] font-extrabold leading-none tracking-tight tabular-nums whitespace-nowrap"
            style={{ color: theme.fg }}
            title={value}
          >
            {value}
          </p>
        )}
      </div>

      {hint && !loading && (
        <span
          className="relative z-[1] inline-flex max-w-full shrink-0 truncate rounded-full px-2 py-0.5 text-[9px] font-bold leading-snug"
          style={{ background: theme.badgeBg, color: theme.muted }}
          title={hint}
        >
          {hint}
        </span>
      )}

      <Watermark
        size={52}
        className="pointer-events-none absolute bottom-1.5 right-1.5 opacity-[0.14]"
        strokeWidth={1.15}
        style={{ color: theme.iconColor }}
      />
    </div>
  );
}

function RefundAmountComboCard({
  summary,
  loading,
}: {
  summary: RefundAnalyticsPayload['summary'] | undefined;
  loading?: boolean;
}) {
  return (
    <div className="col-span-2 grid min-h-[6.5rem] min-w-0 grid-cols-2 overflow-hidden rounded-2xl">
      <RefundAmountHalf
        label="Refund amount"
        value={summary ? formatMoney(summary.totalRefundAmountLkr) : '—'}
        icon={Wallet}
        theme={KPI_BOLD.green}
        loading={loading}
        watermark={Wallet}
        bordered
      />
      <RefundAmountHalf
        label="Avg refund"
        value={summary ? formatMoney(summary.avgRefundAmountLkr) : '—'}
        icon={ShoppingBag}
        theme={KPI_BOLD.orange}
        loading={loading}
        hint={
          summary?.avgRefundPercentage != null
            ? `${summary.avgRefundPercentage}% avg`
            : undefined
        }
        watermark={ShoppingBag}
      />
    </div>
  );
}

function RefundOperationsCard({
  orderModes,
  loading,
  periodLabel,
}: {
  orderModes: RefundAnalyticsPayload['byOrderMode'];
  loading?: boolean;
  periodLabel: string;
}) {
  const delivery = orderModes.find((row) => row.mode === 'DELIVERY');
  const pickup = orderModes.find((row) => row.mode === 'TAKEAWAY');

  const slots = [
    {
      key: 'delivery',
      label: 'Delivery',
      row: delivery,
      icon: Truck,
      emptyLabel: 'No delivery refunds',
      fill: refundChartColor(0),
    },
    {
      key: 'pickup',
      label: 'Pickup',
      row: pickup,
      icon: Package,
      emptyLabel: 'No pickup refunds',
      fill: refundChartColor(1),
    },
  ] as const;

  return (
    <div className="card flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-navy-border px-5 py-4">
        <Truck size={16} className="shrink-0 text-brand" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">Order mode split</h2>
          <p className="text-xs text-muted">{periodLabel} · delivery vs pickup refunds</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : orderModes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No order mode data</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {slots.map((slot, index) => {
              const Icon = slot.icon;
              const row = slot.row;

              return (
                <div
                  key={slot.key}
                  className={`flex min-h-[7rem] flex-col rounded-xl border border-navy-border/70 bg-navy-light/20 p-4 ${index === 0 ? 'sm:border-r sm:border-navy-border/60 sm:pr-5' : ''}`}
                >
                  {row ? (
                    <>
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                          <Icon size={16} className={slot.key === 'delivery' ? 'text-brand' : 'text-muted'} />
                        </div>
                        <p className="text-sm font-semibold text-fg">{slot.label}</p>
                      </div>
                      <p className="text-2xl font-bold tabular-nums text-brand">{row.percent}%</p>
                      <p className="mt-1 text-xs text-muted">
                        {row.count} refund{row.count !== 1 ? 's' : ''}
                      </p>
                      <div className="mt-auto pt-4">
                        <div className="h-2 overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.max(row.percent, row.count > 0 ? 4 : 0)}%`,
                              backgroundColor: slot.fill,
                            }}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
                      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                        <Icon size={16} className="text-muted" />
                      </div>
                      <p className="text-sm font-medium text-fg">{slot.label}</p>
                      <p className="mt-1 text-xs text-muted">{slot.emptyLabel}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RefundAnalyticsPanel({ showBranchFilter = false }: Props) {
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [storeFilter, setStoreFilter] = useState('');

  const storesQuery = useQuery({
    queryKey: ['admin-stores-refunds-analytics'],
    queryFn: async () => {
            const res = await fetch(`${getApiBaseUrl()}/stores`, {
        headers: adminAuthHeaders(), credentials: 'include',
      });
      const json = await res.json();
      const rows = json.data ?? json;
      return Array.isArray(rows) ? (rows as Array<{ id: string; name: string }>) : [];
    },
    enabled: showBranchFilter,
  });

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    const { startDate, endDate } = orderDateRange(period, customRange);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (showBranchFilter && storeFilter) params.set('storeId', storeFilter);
    return `/refunds/analytics?${params.toString()}`;
  }, [period, customRange, showBranchFilter, storeFilter]);

  const { data, isFetching, isLoading, refetch } = useQuery({
    queryKey: ['admin-refunds-analytics', queryUrl],
    queryFn: () => fetchRefundAnalytics(queryUrl),
    placeholderData: keepPreviousData,
  });

  const loading = isLoading || (isFetching && !data);
  const periodLabel = formatDashboardPeriodLabel(period, customRange);
  const summary = data?.summary;

  const cancelAtChart = useMemo(
    () => toChartPoints(data?.byCancelAtStatus ?? [], (row) => row.status),
    [data?.byCancelAtStatus],
  );

  const reasonChart = useMemo(
    () => toChartPoints(data?.byReason ?? [], (row) => row.reason),
    [data?.byReason],
  );

  const requestTypeBars = useMemo(
    () =>
      (data?.byRequestType ?? []).map((row) => ({
        label: row.label,
        count: row.count,
        percent: row.percent,
      })),
    [data?.byRequestType],
  );

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <DashboardPeriodFilter
            period={period}
            customRange={customRange}
            onPeriodChange={setPeriod}
            onCustomRangeChange={(range) => {
              setCustomRange(range);
              if (range?.from && range?.to) setPeriod('custom');
            }}
            showPresetDates
          />
          {showBranchFilter && (
            <SearchableBranchSelect
              stores={storesQuery.data ?? []}
              value={storeFilter || undefined}
              onChange={setStoreFilter}
              formatName={shortBranchName}
              placeholder="All branches"
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="btn-outline p-2.5 self-start sm:self-auto"
          aria-label="Refresh analytics"
        >
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      <p className="text-xs text-muted -mt-2">{periodLabel} · all refund statuses</p>

      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4 xl:items-stretch">
        <RefundSummaryBlueCard
          summary={summary}
          avgProcessingHours={data?.avgProcessingHours}
          loading={loading}
        />
        <RefundAmountComboCard summary={summary} loading={loading} />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2 xl:items-stretch">
        <div className="card min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-navy-border px-5 py-4">
            <LineChart size={16} className="shrink-0 text-brand" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-fg">Daily refund trend</h2>
              <p className="text-xs text-muted">
                {periodLabel} · refund count per day · tooltip shows amount
              </p>
            </div>
          </div>
          <div className="px-3 py-4 sm:px-5">
            <RefundDailyTrendChart data={data?.dailyTrend ?? []} loading={loading} />
          </div>
        </div>

        <RefundOperationsCard
          orderModes={data?.byOrderMode ?? []}
          loading={loading}
          periodLabel={periodLabel}
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <BreakdownCard
          title="Cancel-at status"
          description="Order status when the refund was requested"
          items={data?.byCancelAtStatus ?? []}
          chartData={cancelAtChart}
          loading={loading}
          emptyLabel="No cancel-at status data"
        />
        <div className="card min-w-0 overflow-visible p-5">
          <h2 className="text-sm font-semibold text-fg mb-1">Request type</h2>
          <p className="text-xs text-muted mb-4">Within window, after window, or cashier cancel</p>
          <RefundBreakdownVerticalBarChart
            data={requestTypeBars}
            loading={loading}
            emptyLabel="No request type data"
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <BreakdownCard
          title="Cancellation reasons"
          description="Most common reasons with share of refunds"
          items={data?.byReason ?? []}
          chartData={reasonChart}
          loading={loading}
          emptyLabel="No reason data"
        />

        <div className="card min-w-0 overflow-hidden p-5">
          <h2 className="text-sm font-semibold text-fg mb-1">Top refunding products</h2>
          <p className="text-xs text-muted mb-4">Products appearing most often in refunded orders</p>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-white/5" />
              ))}
            </div>
          ) : (data?.topProducts.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No product data for this period</p>
          ) : (
            <div className="space-y-3">
              {data?.topProducts.map((product, index) => (
                <div
                  key={product.productId}
                  className="flex items-center gap-3 rounded-lg border border-navy-border/60 px-3 py-2.5"
                >
                  <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-muted">
                    {index + 1}
                  </span>
                  <ProductImage
                    name={product.productName}
                    imageUrl={product.imageUrl}
                    className="size-10 shrink-0 rounded-md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{product.productName}</p>
                    <p className="text-xs text-muted">
                      {product.refundCount} refund{product.refundCount !== 1 ? 's' : ''} ·{' '}
                      {product.percent}%
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">
                    {formatMoney(product.refundAmountLkr)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
