'use client';

import { memo, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { isOperatingHour, OPERATING_HOURS } from '@/lib/storeHours';
import { formatMoney } from '@/lib/receipt';

export type PeakHourPoint = {
  hour: number;
  label: string;
  orders: number;
  revenue: number;
};

const PEAK_BAR_GREEN = '#10b981';
const PEAK_BAR_BLUE = '#307ef2';
const PEAK_BAR_BLUE_MUTED = '#93c5fd';

type Props = {
  data: PeakHourPoint[];
  loading?: boolean;
  compact?: boolean;
  accent?: 'green' | 'blue';
};

function PeakHoursBarChart({
  data,
  loading,
  compact = false,
  accent = 'green',
}: Props) {
  const barColor = accent === 'blue' ? PEAK_BAR_BLUE : PEAK_BAR_GREEN;
  const chartConfig = {
    orders: {
      label: 'Orders',
      color: barColor,
    },
  } satisfies ChartConfig;
  const minHeight = compact ? 160 : 180;

  const chartData = useMemo(
    () => data.filter((point) => isOperatingHour(point.hour)),
    [data],
  );
  const peak = useMemo(() => {
    const seeded = chartData[0] ?? { hour: 9, label: '9 AM', orders: 0, revenue: 0 };
    return chartData.reduce(
      (best, point) => (point.orders > best.orders ? point : best),
      seeded,
    );
  }, [chartData]);

  if (loading) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm text-muted"
        style={{ minHeight }}
      >
        Loading chart…
      </div>
    );
  }

  if (chartData.length === 0 || chartData.every((point) => point.orders === 0)) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm text-muted"
        style={{ minHeight }}
      >
        No paid orders in this period
      </div>
    );
  }

  const peakValueClass =
    accent === 'blue'
      ? 'font-bold text-blue-700 dark:text-blue-300'
      : 'font-bold text-emerald-600 dark:text-emerald-400';

  return (
    <div className="flex h-full w-full flex-col" style={{ minHeight }}>
      {peak.orders > 0 && (
        <p className="mb-2 shrink-0 text-[11px] text-muted">
          Busiest hour:{' '}
          <span className="font-semibold text-fg">{peak.label}</span>
          {' · '}
          <span className={peakValueClass}>{peak.orders} orders</span>
        </p>
      )}
      <ChartContainer
        config={chartConfig}
        className="aspect-auto min-h-0 flex-1 h-full w-full [&>.recharts-responsive-container]:min-h-0 [&>.recharts-responsive-container]:h-full [&>.recharts-responsive-container]:w-full [&>.recharts-responsive-container]:flex-1"
        initialDimension={{ width: 640, height: compact ? 200 : 320 }}
      >
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            height={24}
            interval={0}
            tickFormatter={(label, index) =>
              OPERATING_HOURS[index] % 2 === 1 ? '' : String(label)
            }
            className="text-[10px]"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={28}
            allowDecimals={false}
            className="text-[10px]"
          />
          <ChartTooltip
            cursor={{
              fill: accent === 'blue' ? 'rgba(48,126,242,0.12)' : 'rgba(16,185,129,0.12)',
            }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
                formatter={(value, _name, item) => (
                  <div className="flex w-full flex-col items-end gap-0.5">
                    <span className="font-mono font-bold text-foreground">
                      {value} order{Number(value) !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {formatMoney(Number(item.payload.revenue))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Bar
            dataKey="orders"
            fill={`var(--color-orders, ${barColor})`}
            radius={[4, 4, 0, 0]}
            maxBarSize={compact ? 14 : 18}
          >
            {accent === 'blue'
              ? chartData.map((entry) => (
                  <Cell
                    key={entry.hour}
                    fill={entry.hour === peak.hour ? PEAK_BAR_BLUE : PEAK_BAR_BLUE_MUTED}
                  />
                ))
              : null}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

export default memo(PeakHoursBarChart);
