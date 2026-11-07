'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';

import { ChartBarsSkeleton } from '@/components/admin/BranchDashboardSkeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { BRAND_ORDER_CHANNEL_COLORS } from '@/lib/brandSalesChartColors';
import { formatMoney } from '@/lib/receipt';

export type OrderSummaryPoint = {
  label: string;
  delivery: number;
  pickupCash: number;
  pickupOnline: number;
  pickupCard: number;
};

const chartConfig = {
  delivery: { label: 'Delivery', color: BRAND_ORDER_CHANNEL_COLORS.delivery },
  pickupCard: { label: 'Pickup Card', color: BRAND_ORDER_CHANNEL_COLORS.pickupCard },
  pickupCash: { label: 'Pickup Cash', color: BRAND_ORDER_CHANNEL_COLORS.pickupCash },
  pickupOnline: { label: 'Pickup Online', color: BRAND_ORDER_CHANNEL_COLORS.pickupOnline },
} satisfies ChartConfig;

type Props = {
  data: OrderSummaryPoint[];
  periodLabel: string;
  loading?: boolean;
  hideDelivery?: boolean;
  compact?: boolean;
};

function formatAxisAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return `${Math.round(value)}`;
}

export default function BranchOrderSummaryChart({
  data,
  periodLabel,
  loading,
  hideDelivery = false,
  compact = false,
}: Props) {
  const chartHeight = compact ? 'h-[220px]' : 'h-[320px]';
  const initialHeight = compact ? 220 : 320;
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        delivery: hideDelivery ? 0 : point.delivery,
        total:
          (hideDelivery ? 0 : point.delivery) +
          point.pickupCash +
          point.pickupOnline +
          point.pickupCard,
      })),
    [data, hideDelivery],
  );

  if (loading) {
    return <ChartBarsSkeleton minHeight={initialHeight} />;
  }

  if (chartData.length === 0 || chartData.every((point) => point.total === 0)) {
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
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            height={28}
            className="text-[10px]"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={40}
            tickFormatter={formatAxisAmount}
            className="text-[10px]"
          />
          <ChartTooltip
            cursor={{ fill: 'rgba(17,46,129,0.06)' }}
            content={
              <ChartTooltipContent
                labelFormatter={(label) => `${label} · ${periodLabel}`}
                formatter={(value, name) => (
                  <span className="font-mono font-bold text-foreground">
                    {formatMoney(Number(value))} · {String(name)}
                  </span>
                )}
              />
            }
          />
          <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          {!hideDelivery && (
            <Bar dataKey="delivery" fill="var(--color-delivery)" radius={[3, 3, 0, 0]} maxBarSize={14} />
          )}
          <Bar dataKey="pickupCard" fill="var(--color-pickupCard)" radius={[3, 3, 0, 0]} maxBarSize={14} />
          <Bar dataKey="pickupCash" fill="var(--color-pickupCash)" radius={[3, 3, 0, 0]} maxBarSize={14} />
          <Bar dataKey="pickupOnline" fill="var(--color-pickupOnline)" radius={[3, 3, 0, 0]} maxBarSize={14} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
