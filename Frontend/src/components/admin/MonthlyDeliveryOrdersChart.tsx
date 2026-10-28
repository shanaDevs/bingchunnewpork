'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney } from '@/lib/receipt';

export type MonthlyDeliveryPoint = {
  month: string;
  shortMonth: string;
  orders: number;
  revenue: number;
};

const chartConfig = {
  orders: {
    label: 'Delivery orders',
    color: '#307ef2',
  },
} satisfies ChartConfig;

type Props = {
  data: MonthlyDeliveryPoint[];
  year: number;
  loading?: boolean;
  compact?: boolean;
};

export default function MonthlyDeliveryOrdersChart({ data, year, loading, compact = false }: Props) {
  const chartHeight = compact ? 220 : 320;
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        orders: Number(point.orders) || 0,
        revenue: Number(point.revenue) || 0,
      })),
    [data],
  );

  const hasOrders = chartData.some((point) => point.orders > 0);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted"
        style={{ height: chartHeight }}
      >
        Loading chart…
      </div>
    );
  }

  if (chartData.length === 0 || !hasOrders) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted"
        style={{ height: chartHeight }}
      >
        No delivery orders in {year}
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-full w-full [&>.recharts-responsive-container]:min-h-0 [&>.recharts-responsive-container]:h-full [&>.recharts-responsive-container]:w-full"
        initialDimension={{ width: 960, height: chartHeight }}
      >
        <BarChart accessibilityLayer data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="shortMonth"
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
            width={36}
            allowDecimals={false}
            domain={[0, 'dataMax']}
            className="text-[11px]"
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => payload?.[0]?.payload?.month ?? ''}
                formatter={(value, _name, item) => (
                  <div className="flex w-full flex-col items-end gap-0.5">
                    <span className="font-mono font-semibold text-foreground">
                      {Number(value).toLocaleString()} order{Number(value) !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatMoney(item.payload.revenue)} revenue
                    </span>
                  </div>
                )}
              />
            }
          />
          <Bar
            dataKey="orders"
            fill="var(--color-orders, #307ef2)"
            radius={4}
            maxBarSize={48}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
