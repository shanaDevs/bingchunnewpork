'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { ChartBarsSkeleton } from '@/components/admin/BranchDashboardSkeleton';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { BRAND_MODE_COLORS } from '@/lib/brandSalesChartColors';

export type OrderModePoint = {
  label: string;
  delivery: number;
  pickup: number;
};

const chartConfig = {
  delivery: { label: 'Delivery', color: BRAND_MODE_COLORS.delivery },
  pickup: { label: 'Pickup', color: BRAND_MODE_COLORS.pickup },
} satisfies ChartConfig;

type Props = {
  data: OrderModePoint[];
  periodLabel: string;
  loading?: boolean;
  hideDelivery?: boolean;
  compact?: boolean;
};

export default function BranchOrderModeStackedChart({
  data,
  periodLabel,
  loading,
  hideDelivery = false,
  compact = false,
}: Props) {
  const chartHeight = compact ? 'min-h-[220px] h-[220px]' : 'min-h-[320px]';
  const initialHeight = compact ? 220 : 320;
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        delivery: hideDelivery ? 0 : point.delivery,
        total: (hideDelivery ? 0 : point.delivery) + point.pickup,
      })),
    [data, hideDelivery],
  );

  if (loading) {
    return <ChartBarsSkeleton minHeight={initialHeight} />;
  }

  if (chartData.length === 0 || chartData.every((point) => point.total === 0)) {
    return (
      <div className={`flex h-full ${chartHeight} items-center justify-center text-sm text-muted`}>
        No orders in this period
      </div>
    );
  }

  return (
    <div className={`h-full ${chartHeight} w-full`}>
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-full w-full [&>.recharts-responsive-container]:min-h-0 [&>.recharts-responsive-container]:h-full [&>.recharts-responsive-container]:w-full"
        initialDimension={{ width: 960, height: initialHeight }}
      >
        <BarChart accessibilityLayer data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            height={28}
            className="text-[10px]"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={32}
            allowDecimals={false}
            className="text-[10px]"
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="dashed"
                labelFormatter={(label) => `${label} · ${periodLabel}`}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {!hideDelivery && (
            <Bar
              dataKey="delivery"
              fill="var(--color-delivery)"
              radius={4}
              maxBarSize={compact ? 18 : 32}
            />
          )}
          <Bar
            dataKey="pickup"
            fill="var(--color-pickup)"
            radius={4}
            maxBarSize={compact ? 18 : 32}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
