'use client';

import { memo, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { ChartBarsSkeleton } from '@/components/admin/BranchDashboardSkeleton';
import { formatMoney } from '@/lib/receipt';

type MonthlyPoint = {
  month: string;
  revenue: number;
  orders: number;
  outflow?: number;
};

const chartConfig = {
  revenue: {
    label: 'Revenue',
    color: '#307ef2',
  },
  outflow: {
    label: 'Outflow',
    color: '#ef4444',
  },
} satisfies ChartConfig;

/** Compact axis labels that scale from ones to trillions */
function formatAxisAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) {
    const scaled = value / 1_000_000_000_000;
    return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(scaled >= 10 ? 0 : 1)}T`;
  }
  if (abs >= 1_000_000_000) {
    const scaled = value / 1_000_000_000;
    return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(scaled >= 10 ? 0 : 1)}B`;
  }
  if (abs >= 1_000_000) {
    const scaled = value / 1_000_000;
    return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(scaled >= 10 ? 0 : 1)}M`;
  }
  if (abs >= 1_000) {
    const scaled = value / 1_000;
    return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(scaled >= 10 ? 0 : 1)}k`;
  }
  return `${Math.round(value)}`;
}

function estimateYAxisWidth(max: number): number {
  if (max <= 0) return 44;
  const sampleTicks = [0, max * 0.25, max * 0.5, max * 0.75, max].map(formatAxisAmount);
  const longest = Math.max(...sampleTicks.map((t) => t.length), 2);
  return Math.min(96, Math.max(44, longest * 8 + 14));
}

function shortMonth(label: string) {
  return label.split(' ')[0] ?? label;
}

type Props = {
  data: MonthlyPoint[];
  loading?: boolean;
  /** Shorter chart for the branch dashboard. Super Admin should omit this. */
  compact?: boolean;
  showCashflow?: boolean;
};

function RevenueOverviewBarChart({
  data,
  loading,
  compact = false,
  showCashflow = false,
}: Props) {
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        month: shortMonth(point.month),
        fullMonth: point.month,
        revenue: point.revenue,
        orders: point.orders,
        outflow: point.outflow ?? 0,
      })),
    [data],
  );

  const maxValue = useMemo(
    () =>
      Math.max(
        ...chartData.map((d) =>
          showCashflow ? Math.max(d.revenue, d.outflow) : d.revenue,
        ),
        0,
      ),
    [chartData, showCashflow],
  );
  const yAxisWidth = useMemo(() => estimateYAxisWidth(maxValue), [maxValue]);
  const chartHeight = compact ? 200 : 380;
  const revenueFillId = compact ? 'fillRevenueCompact' : 'fillRevenue';
  const outflowFillId = compact ? 'fillOutflowCompact' : 'fillOutflow';

  if (loading) {
    return <ChartBarsSkeleton minHeight={chartHeight} />;
  }

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted"
        style={{ height: chartHeight }}
      >
        No revenue data for this period
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-full w-full [&>.recharts-responsive-container]:min-h-0 [&>.recharts-responsive-container]:h-full [&>.recharts-responsive-container]:w-full [&>.recharts-responsive-container]:flex-1"
        initialDimension={{ width: compact ? 640 : 960, height: chartHeight }}
      >
        <AreaChart data={chartData} margin={{ top: compact ? 8 : 12, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={revenueFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-revenue, #307ef2)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-revenue, #307ef2)" stopOpacity={0.02} />
            </linearGradient>
            {showCashflow ? (
              <linearGradient id={outflowFillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-outflow, #ef4444)" stopOpacity={0.24} />
                <stop offset="100%" stopColor="var(--color-outflow, #ef4444)" stopOpacity={0.02} />
              </linearGradient>
            ) : null}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            height={32}
            className="text-[11px]"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={yAxisWidth}
            domain={[0, maxValue > 0 ? 'auto' : 1]}
            tickFormatter={formatAxisAmount}
            className="text-[11px]"
          />
          <ChartTooltip
            cursor={{
              stroke: 'var(--color-revenue, #307ef2)',
              strokeWidth: 1,
              strokeDasharray: '4 4',
            }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullMonth ?? ''}
                formatter={(value, name, item) => {
                  const series = chartConfig[name as keyof typeof chartConfig]?.label ?? name;
                  return (
                    <div className="flex w-full flex-col items-end gap-0.5">
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">{series}</span>
                        <span className="font-mono font-semibold text-foreground">
                          {formatMoney(Number(value))}
                        </span>
                      </div>
                      {!showCashflow && name === 'revenue' ? (
                        <span className="text-[10px] text-muted-foreground">
                          {item.payload.orders} order{item.payload.orders !== 1 ? 's' : ''}
                        </span>
                      ) : null}
                    </div>
                  );
                }}
              />
            }
          />
          {showCashflow ? (
            <ChartLegend content={<ChartLegendContent className="pt-1 text-[11px]" />} />
          ) : null}
          <Area
            dataKey="revenue"
            type="monotone"
            fill={`url(#${revenueFillId})`}
            stroke="var(--color-revenue, #307ef2)"
            strokeWidth={2}
            dot={{ fill: 'var(--color-revenue, #307ef2)', r: compact ? 2 : 3, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
          />
          {showCashflow ? (
            <Area
              dataKey="outflow"
              type="monotone"
              fill={`url(#${outflowFillId})`}
              stroke="var(--color-outflow, #ef4444)"
              strokeWidth={2}
              dot={{ fill: 'var(--color-outflow, #ef4444)', r: compact ? 2 : 3, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
            />
          ) : null}
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

export default memo(RevenueOverviewBarChart);
