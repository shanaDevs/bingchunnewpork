'use client';

import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { ChartAreaSkeleton } from '@/components/admin/BranchDashboardSkeleton';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { BRAND_REVENUE_FLOW_COLORS } from '@/lib/brandSalesChartColors';
import { formatMoney } from '@/lib/receipt';

export type SalesOverviewPoint = {
  period: string;
  revenue: number;
  /** @deprecated Chart no longer plots orders; kept for API payload compatibility */
  orders?: number;
  outflow?: number;
  discount?: number;
};

const chartConfig = {
  revenue: { label: 'Revenue', color: BRAND_REVENUE_FLOW_COLORS.revenue },
  outflow: { label: 'Outflow', color: BRAND_REVENUE_FLOW_COLORS.outflow },
} satisfies ChartConfig;

function formatAxisAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return `${Math.round(value)}`;
}

type Props = {
  data: SalesOverviewPoint[];
  loading?: boolean;
  compact?: boolean;
  hideOutflow?: boolean;
};

export default function BrandSalesOverviewChart({
  data,
  loading,
  compact = false,
  hideOutflow = false,
}: Props) {
  const chartHeight = compact ? 'h-[220px]' : 'h-[360px]';
  const initialHeight = compact ? 220 : 360;
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        label: point.period,
        revenue: point.revenue,
        outflow: hideOutflow ? 0 : (point.outflow ?? point.discount ?? 0),
      })),
    [data, hideOutflow],
  );

  const maxValue = useMemo(
    () => Math.max(...chartData.map((d) => Math.max(d.revenue, hideOutflow ? 0 : d.outflow)), 0),
    [chartData, hideOutflow],
  );

  if (loading) {
    return <ChartAreaSkeleton height={initialHeight} />;
  }

  if (
    chartData.length === 0 ||
    chartData.every((point) => point.revenue === 0 && point.outflow === 0)
  ) {
    return (
      <div className={`flex ${chartHeight} items-center justify-center text-sm text-muted`}>
        No sales data for this period
      </div>
    );
  }

  return (
    <div className={`${chartHeight} w-full`}>
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-full w-full [&>.recharts-responsive-container]:min-h-0 [&>.recharts-responsive-container]:h-full [&>.recharts-responsive-container]:w-full"
        initialDimension={{ width: 960, height: initialHeight }}
      >
        <AreaChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="fillBrandRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-revenue, #307ef2)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-revenue, #307ef2)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fillBrandOutflow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.24} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="label"
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
            width={52}
            domain={[0, maxValue > 0 ? 'auto' : 1]}
            tickFormatter={formatAxisAmount}
            className="text-[11px]"
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
                formatter={(value, name) => {
                  const label = chartConfig[name as keyof typeof chartConfig]?.label ?? name;
                  return (
                    <span className="font-mono font-semibold">
                      {label}: {formatMoney(Number(value))}
                    </span>
                  );
                }}
              />
            }
          />
          {hideOutflow ? null : <ChartLegend content={<ChartLegendContent className="text-[11px]" />} />}
          <Area
            dataKey="revenue"
            type="monotone"
            fill="url(#fillBrandRevenue)"
            stroke="var(--color-revenue, #307ef2)"
            strokeWidth={2}
            dot={{ fill: 'var(--color-revenue, #307ef2)', r: compact ? 2 : 3, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
          />
          {hideOutflow ? null : (
            <Area
              dataKey="outflow"
              type="monotone"
              fill="url(#fillBrandOutflow)"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ fill: '#ef4444', r: compact ? 2 : 3, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
            />
          )}
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
