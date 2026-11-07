'use client';

import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { ChartBarsSkeleton } from '@/components/admin/BranchDashboardSkeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { BRAND_REVENUE_FLOW_COLORS } from '@/lib/brandSalesChartColors';

export type HourlyActivityPoint = {
  hour: number;
  label: string;
  orders: number;
  revenue?: number;
};

const chartConfig = {
  orders: { label: 'Orders', color: BRAND_REVENUE_FLOW_COLORS.revenue },
} satisfies ChartConfig;

/** X-axis labels shown on the reference hourly activity chart */
const HOUR_AXIS_TICKS = new Set([0, 4, 8, 12, 16, 20, 22]);

const CHART_HEIGHT = 200;
const BAR_COLOR = BRAND_REVENUE_FLOW_COLORS.revenue;

function formatHourLabel(hour: number) {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

export function sumHeatmapByHour(
  cells: Array<{ hour: number; orders: number; revenue?: number }>,
): HourlyActivityPoint[] {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHourLabel(hour),
    orders: 0,
    revenue: 0,
  }));
  for (const cell of cells) {
    hours[cell.hour].orders += cell.orders;
    hours[cell.hour].revenue += cell.revenue ?? 0;
  }
  return hours;
}

export function BrandHourlyPeriodBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-[#e2e8f0] bg-white px-2.5 py-1 text-[11px] font-medium text-fg shadow-sm"
      aria-hidden
    >
      {label}
      <ChevronDown size={12} className="shrink-0 text-muted" strokeWidth={2.25} />
    </span>
  );
}

type Props = {
  data: HourlyActivityPoint[];
  loading?: boolean;
};

export default function BrandHourlyActivityChart({ data, loading }: Props) {
  const chartData = useMemo(
    () => data.map((point) => ({ ...point, orders: point.orders || 0 })),
    [data],
  );
  const peak = useMemo(
    () =>
      chartData.reduce(
        (best, point) => (point.orders > best.orders ? point : best),
        chartData[0] ?? { orders: 0, label: '—', hour: 0 },
      ),
    [chartData],
  );

  const yMax = useMemo(() => {
    const maxOrders = Math.max(...chartData.map((point) => point.orders), 0);
    if (maxOrders <= 0) return 4;
    return Math.max(4, Math.ceil(maxOrders * 1.15));
  }, [chartData]);

  if (loading) {
    return <ChartBarsSkeleton minHeight={CHART_HEIGHT + 28} />;
  }

  if (chartData.length === 0 || chartData.every((point) => point.orders === 0)) {
    return (
      <p className="flex h-[228px] items-center justify-center text-sm text-muted">
        No hourly orders in this period
      </p>
    );
  }

  const peakOrderLabel = peak.orders === 1 ? 'order' : 'orders';

  return (
    <div className="space-y-3">
      {peak.orders > 0 ? (
        <p className="text-[12px] leading-snug text-muted">
          Peak:{' '}
          <span className="font-semibold text-fg">{peak.label}</span>
          <span className="text-muted">
            {' '}
            · {peak.orders.toLocaleString()} {peakOrderLabel}
          </span>
        </p>
      ) : null}
      <div className="h-[200px] w-full">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-full w-full [&>.recharts-responsive-container]:min-h-0 [&>.recharts-responsive-container]:h-full"
          initialDimension={{ width: 960, height: CHART_HEIGHT }}
        >
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -4, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tickLine={{ stroke: '#e2e8f0', strokeWidth: 1 }}
              axisLine={{ stroke: '#e2e8f0', strokeWidth: 1 }}
              tickMargin={10}
              height={32}
              interval={0}
              tickFormatter={(_label, index) => {
                const hour = chartData[index]?.hour;
                return hour !== undefined && HOUR_AXIS_TICKS.has(hour) ? chartData[index].label : '';
              }}
              className="text-[10px] fill-[#94a3b8]"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={28}
              allowDecimals={false}
              domain={[0, yMax]}
              tickCount={Math.min(5, yMax + 1)}
              className="text-[10px] fill-[#94a3b8]"
            />
            <ChartTooltip
              cursor={{ fill: 'rgba(48,126,242,0.08)' }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
                  formatter={(value) => (
                    <span className="font-mono font-semibold">
                      {Number(value).toLocaleString()} order{Number(value) !== 1 ? 's' : ''}
                    </span>
                  )}
                />
              }
            />
            <Bar
              dataKey="orders"
              fill={BAR_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={10}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
