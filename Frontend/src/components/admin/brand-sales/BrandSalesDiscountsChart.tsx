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

export type SalesDiscountPoint = {
  period: string;
  revenue: number;
  discount?: number;
};

const chartConfig = {
  revenue: { label: 'Gross Sales', color: BRAND_REVENUE_FLOW_COLORS.revenue },
  discount: { label: 'Discounts', color: '#f97316' },
} satisfies ChartConfig;

function formatAxisAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return `${Math.round(value)}`;
}

type Props = {
  data: SalesDiscountPoint[];
  loading?: boolean;
};

export default function BrandSalesDiscountsChart({ data, loading }: Props) {
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        label: point.period,
        revenue: point.revenue,
        discount: point.discount ?? 0,
      })),
    [data],
  );

  if (loading) {
    return <ChartAreaSkeleton height={220} />;
  }

  if (chartData.length === 0 || chartData.every((point) => point.revenue === 0 && point.discount === 0)) {
    return <p className="flex h-[220px] items-center justify-center text-sm text-muted">No sales data for this period</p>;
  }

  return (
    <div className="h-[220px] w-full">
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-full w-full [&>.recharts-responsive-container]:min-h-0 [&>.recharts-responsive-container]:h-full"
        initialDimension={{ width: 960, height: 220 }}
      >
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="fillSalesDiscountRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-revenue, #307ef2)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-revenue, #307ef2)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fillSalesDiscountAmount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-discount, #f97316)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-discount, #f97316)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} height={28} className="text-[11px]" />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={44}
            tickFormatter={formatAxisAmount}
            className="text-[11px]"
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <span className="font-mono font-semibold">{formatMoney(Number(value))}</span>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Area
            dataKey="revenue"
            type="monotone"
            fill="url(#fillSalesDiscountRevenue)"
            stroke="var(--color-revenue, #307ef2)"
            strokeWidth={2}
            dot={{ fill: 'var(--color-revenue, #307ef2)', r: 2, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
          />
          <Area
            dataKey="discount"
            type="monotone"
            fill="url(#fillSalesDiscountAmount)"
            stroke="var(--color-discount, #f97316)"
            strokeWidth={2}
            dot={{ fill: 'var(--color-discount, #f97316)', r: 2, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
