'use client';

import { adminAuthHeaders } from '@/lib/adminSession';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { addDays, differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  DollarSign,
  LineChart,
  ListOrdered,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Trophy,
  XCircle,
} from 'lucide-react';

import DashboardPeriodFilter, {
  formatDashboardPeriodLabel,
  orderDateRange,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import RefundDailyTrendChart from '@/components/admin/RefundDailyTrendChart';
import RefundDistributionDonutChart, {
  type RefundDistributionPoint,
} from '@/components/admin/RefundDistributionDonutChart';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import SparklineKpiCard from '@/components/admin/SparklineKpiCard';
import ProductImage from '@/components/ui/ProductImage';
import { getApiBaseUrl } from '@/lib/apiBase';
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
  onBackToProcess?: () => void;
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

function previousDateRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return {};
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const length = differenceInCalendarDays(end, start) + 1;
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, length - 1);
  return {
    startDate: format(prevStart, 'yyyy-MM-dd'),
    endDate: format(prevEnd, 'yyyy-MM-dd'),
  };
}

function changePercent(current: number, previous: number | undefined): number | null {
  if (previous == null) return null;
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10) / 10;
}

function fillDailyTrend(
  startDate: string | undefined,
  endDate: string | undefined,
  points: Array<{ date: string; count: number; amountLkr: number }>,
) {
  if (!startDate || !endDate) return points;
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (differenceInCalendarDays(end, start) > 62) return points;
  const byDate = new Map(points.map((point) => [point.date, point]));
  const filled: Array<{ date: string; count: number; amountLkr: number }> = [];
  let cursor = start;
  while (cursor <= end) {
    const key = format(cursor, 'yyyy-MM-dd');
    filled.push(byDate.get(key) ?? { date: key, count: 0, amountLkr: 0 });
    cursor = addDays(cursor, 1);
  }
  return filled;
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

function AnalyticsDonutCard({
  title,
  description,
  icon: Icon,
  data,
  loading,
  emptyLabel,
}: {
  title: string;
  description: string;
  icon: typeof BarChart3;
  data: RefundDistributionPoint[];
  loading?: boolean;
  emptyLabel: string;
}) {
  return (
    <div className="card flex min-w-0 flex-col overflow-hidden p-5">
      <div className="mb-4 flex items-start gap-2">
        <Icon size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <p className="text-xs text-muted">{description}</p>
        </div>
      </div>
      <div className="flex min-h-[11rem] flex-1 items-center">
        <RefundDistributionDonutChart
          data={data}
          loading={loading}
          emptyLabel={emptyLabel}
          compact
          centerMode="total"
          legendSide
        />
      </div>
    </div>
  );
}

function CancellationReasonsCard({
  items,
  loading,
}: {
  items: Array<{ label: string; count: number; percent: number; fill?: string }>;
  loading?: boolean;
}) {
  const themed = items.map((item, index) => ({
    ...item,
    fill: item.fill ?? refundChartColor(index),
  }));
  const maxCount = Math.max(...themed.map((item) => item.count), 1);

  return (
    <div className="card flex min-w-0 flex-col overflow-hidden p-5">
      <div className="mb-4 flex items-start gap-2">
        <ListOrdered size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">Cancellation Reasons</h2>
          <p className="text-xs text-muted">Most common reasons this period</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 py-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : themed.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No reason data</p>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-4">
          {themed.map((item) => (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-fg">{item.label}</span>
                <span className="shrink-0 tabular-nums text-muted">{item.count}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 8 : 0)}%`,
                    backgroundColor: item.fill,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RefundAnalyticsPanel({
  showBranchFilter = false,
  onBackToProcess,
}: Props) {
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [storeFilter, setStoreFilter] = useState('');

  const storesQuery = useQuery({
    queryKey: ['admin-stores-refunds-analytics'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/stores`, {
        headers: adminAuthHeaders(),
        credentials: 'include',
      });
      const json = await res.json();
      const rows = json.data ?? json;
      return Array.isArray(rows) ? (rows as Array<{ id: string; name: string }>) : [];
    },
    enabled: showBranchFilter,
  });

  const currentRange = useMemo(() => orderDateRange(period, customRange), [period, customRange]);
  const previousRange = useMemo(
    () => previousDateRange(currentRange.startDate, currentRange.endDate),
    [currentRange.endDate, currentRange.startDate],
  );

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (currentRange.startDate) params.set('startDate', currentRange.startDate);
    if (currentRange.endDate) params.set('endDate', currentRange.endDate);
    if (showBranchFilter && storeFilter) params.set('storeId', storeFilter);
    return `/refunds/analytics?${params.toString()}`;
  }, [currentRange.endDate, currentRange.startDate, showBranchFilter, storeFilter]);

  const previousQueryUrl = useMemo(() => {
    if (!previousRange.startDate || !previousRange.endDate) return null;
    const params = new URLSearchParams();
    params.set('startDate', previousRange.startDate);
    params.set('endDate', previousRange.endDate);
    if (showBranchFilter && storeFilter) params.set('storeId', storeFilter);
    return `/refunds/analytics?${params.toString()}`;
  }, [previousRange.endDate, previousRange.startDate, showBranchFilter, storeFilter]);

  const { data, isFetching, isLoading, refetch } = useQuery({
    queryKey: ['admin-refunds-analytics', queryUrl],
    queryFn: () => fetchRefundAnalytics(queryUrl),
    placeholderData: keepPreviousData,
  });

  const previousQuery = useQuery({
    queryKey: ['admin-refunds-analytics-previous', previousQueryUrl],
    queryFn: () => fetchRefundAnalytics(previousQueryUrl!),
    enabled: Boolean(previousQueryUrl),
    placeholderData: keepPreviousData,
  });

  const loading = isLoading || (isFetching && !data);
  const periodLabel = formatDashboardPeriodLabel(period, customRange);
  const changeLabel = period === 'month' ? 'vs last month' : 'vs previous period';
  const summary = data?.summary;
  const previousSummary = previousQuery.data?.summary;

  const filledTrend = useMemo(
    () => fillDailyTrend(currentRange.startDate, currentRange.endDate, data?.dailyTrend ?? []),
    [currentRange.endDate, currentRange.startDate, data?.dailyTrend],
  );

  const sparklineCounts = useMemo(
    () => filledTrend.map((point) => point.count),
    [filledTrend],
  );

  const sparklineAmounts = useMemo(
    () => filledTrend.map((point) => point.amountLkr),
    [filledTrend],
  );

  const requestTypeChart = useMemo(
    () => toChartPoints(data?.byRequestType ?? [], (row) => row.type),
    [data?.byRequestType],
  );

  const cancelAtChart = useMemo(
    () => toChartPoints(data?.byCancelAtStatus ?? [], (row) => row.status),
    [data?.byCancelAtStatus],
  );

  const orderModeChart = useMemo(
    () => toChartPoints(data?.byOrderMode ?? [], (row) => row.mode),
    [data?.byOrderMode],
  );

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-1 text-sm text-muted">
            {onBackToProcess ? (
              <button
                type="button"
                onClick={onBackToProcess}
                className="inline-flex items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-navy-light hover:text-fg"
              >
                <ChevronLeft size={16} />
                Refunds
              </button>
            ) : (
              <span>Refunds</span>
            )}
            <span aria-hidden>/</span>
            <span className="text-fg">Analytics</span>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10">
              <RotateCcw size={18} className="text-brand" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-fg sm:text-2xl">Refunds Analytics</h2>
              <p className="text-sm text-muted">
                Track refund trends, reasons, and performance insights
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {showBranchFilter && (
            <SearchableBranchSelect
              stores={storesQuery.data ?? []}
              value={storeFilter || undefined}
              onChange={setStoreFilter}
              formatName={shortBranchName}
              placeholder="All branches"
            />
          )}
          <DashboardPeriodFilter
            period={period}
            customRange={customRange}
            onPeriodChange={setPeriod}
            onCustomRangeChange={(range) => {
              setCustomRange(range);
              if (range?.from && range?.to) setPeriod('custom');
            }}
            showPresetDates
            compact
          />
          <button
            type="button"
            onClick={() => void refetch()}
            className="btn-outline p-2.5"
            aria-label="Refresh analytics"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-5">
        <SparklineKpiCard
          label="Total Refunds"
          value={summary ? String(summary.totalCount) : '—'}
          icon={RotateCcw}
          tone="blue"
          loading={loading}
          series={sparklineCounts}
          changePercent={changePercent(summary?.totalCount ?? 0, previousSummary?.totalCount)}
          changeLabel={changeLabel}
        />
        <SparklineKpiCard
          label="Refund Amount"
          value={summary ? formatMoney(summary.totalRefundAmountLkr) : '—'}
          icon={DollarSign}
          tone="blue"
          loading={loading}
          series={sparklineAmounts}
          changePercent={changePercent(
            summary?.totalRefundAmountLkr ?? 0,
            previousSummary?.totalRefundAmountLkr,
          )}
          changeLabel={changeLabel}
        />
        <SparklineKpiCard
          label="Average Refund Amount"
          value={summary ? formatMoney(summary.avgRefundAmountLkr) : '—'}
          icon={BarChart3}
          tone="blue"
          loading={loading}
          series={sparklineAmounts}
          changePercent={changePercent(
            summary?.avgRefundAmountLkr ?? 0,
            previousSummary?.avgRefundAmountLkr,
          )}
          changeLabel={changeLabel}
        />
        <SparklineKpiCard
          label="Completion Rate"
          value={summary ? `${summary.completeRatePercent}%` : '—'}
          icon={CheckCircle2}
          tone="green"
          loading={loading}
          series={sparklineCounts}
          changePercent={changePercent(
            summary?.completeRatePercent ?? 0,
            previousSummary?.completeRatePercent,
          )}
          changeLabel={changeLabel}
        />
        <SparklineKpiCard
          label="Rejection Rate"
          value={summary ? `${summary.rejectionRatePercent}%` : '—'}
          icon={XCircle}
          tone="red"
          loading={loading}
          series={sparklineCounts}
          changePercent={changePercent(
            summary?.rejectionRatePercent ?? 0,
            previousSummary?.rejectionRatePercent,
          )}
          changeLabel={changeLabel}
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
        <AnalyticsDonutCard
          title="Request Type"
          description={`Refund request types · ${periodLabel}`}
          icon={ShoppingBag}
          data={requestTypeChart}
          loading={loading}
          emptyLabel="No request type data"
        />

        <div className="card min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-navy-border px-5 py-4">
            <div className="flex min-w-0 items-center gap-2">
              <LineChart size={16} className="shrink-0 text-brand" aria-hidden />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-fg">Refund Trend</h2>
                <p className="text-xs text-muted">{periodLabel} · refund count per day</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
              Refunds
            </span>
          </div>
          <div className="px-3 py-4 sm:px-5">
            <RefundDailyTrendChart
              data={filledTrend}
              loading={loading}
              compact
              variant="line"
            />
          </div>
        </div>

        <AnalyticsDonutCard
          title="Cancel at Status"
          description="Order status when the refund was requested"
          icon={CheckCircle2}
          data={cancelAtChart}
          loading={loading}
          emptyLabel="No cancel-at status data"
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <AnalyticsDonutCard
          title="Order Mode Split"
          description={`Refunds by order mode · ${periodLabel}`}
          icon={ShoppingBag}
          data={orderModeChart}
          loading={loading}
          emptyLabel="No order mode data"
        />

        <CancellationReasonsCard items={data?.byReason ?? []} loading={loading} />

        <div className="card min-w-0 overflow-hidden p-5">
          <div className="mb-4 flex items-start gap-2">
            <Trophy size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-fg">Top Refunding Products</h2>
              <p className="text-xs text-muted">Products appearing most often in refunded orders</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-white/5" />
              ))}
            </div>
          ) : (data?.topProducts.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No product data for this period</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[16rem] text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-2 font-medium">#</th>
                    <th className="pb-2 pr-2 font-medium">Product</th>
                    <th className="pb-2 pr-2 text-right font-medium">Refunds Count</th>
                    <th className="pb-2 text-right font-medium">Refund Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.topProducts.map((product, index) => (
                    <tr key={product.productId} className="border-t border-navy-border/60">
                      <td className="py-2.5 pr-2 tabular-nums text-muted">{index + 1}.</td>
                      <td className="py-2.5 pr-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ProductImage
                            name={product.productName}
                            imageUrl={product.imageUrl}
                            className="size-9 shrink-0 rounded-md"
                          />
                          <span className="min-w-0 truncate font-medium text-fg">
                            {product.productName}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-2 text-right tabular-nums text-fg">
                        {product.refundCount}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted">
                        {product.percent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
