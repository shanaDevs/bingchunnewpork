'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { refundChartColor } from '@/lib/refundChartPalette';

export type RefundBreakdownBarPoint = {
  label: string;
  count: number;
  percent: number;
};

const chartConfig = {
  count: {
    label: 'Refunds',
    color: '#307ef2',
  },
} satisfies ChartConfig;

type AxisTickProps = {
  x?: string | number;
  y?: string | number;
  payload?: { value?: string };
};

function WrappedCategoryTick({ x = 0, y = 0, payload }: AxisTickProps) {
  const label = String(payload?.value ?? '');
  const words = label.split(' ');
  const midpoint = Math.ceil(words.length / 2);
  const line1 = words.slice(0, midpoint).join(' ');
  const line2 = words.slice(midpoint).join(' ');

  return (
    <g transform={`translate(${Number(x)},${Number(y)})`}>
      <text
        textAnchor="middle"
        fill="currentColor"
        className="fill-muted-foreground text-[10px]"
      >
        <tspan x={0} dy={14}>
          {line1}
        </tspan>
        {line2 ? (
          <tspan x={0} dy={12}>
            {line2}
          </tspan>
        ) : null}
      </text>
    </g>
  );
}

type Props = {
  data: RefundBreakdownBarPoint[];
  loading?: boolean;
  emptyLabel?: string;
  height?: number;
};

export default function RefundBreakdownVerticalBarChart({
  data,
  loading,
  emptyLabel = 'No data for this period',
  height = 300,
}: Props) {
  const chartData = useMemo(
    () =>
      data.map((point, index) => ({
        ...point,
        fill: refundChartColor(index),
      })),
    [data],
  );

  const yAxisMax = useMemo(() => {
    const maxCount = Math.max(...chartData.map((point) => point.count), 0);
    if (maxCount <= 0) return 1;
    return Math.max(Math.ceil(maxCount * 1.15), maxCount + 1);
  }, [chartData]);

  if (loading) {
    return (
      <div
        className="flex w-full min-w-0 items-center justify-center rounded-lg border border-dashed border-navy-border/60 bg-white/[0.02] text-sm text-muted"
        style={{ height }}
      >
        Loading chart…
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div
        className="flex w-full min-w-0 items-center justify-center rounded-lg border border-dashed border-navy-border/60 bg-white/[0.02] text-sm text-muted"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 overflow-visible rounded-lg" style={{ height }}>
      <ChartContainer
        config={chartConfig}
        className="!aspect-auto flex h-full w-full min-w-0 max-w-none overflow-visible [&>.recharts-responsive-container]:!h-full [&>.recharts-responsive-container]:!w-full [&>.recharts-responsive-container]:min-h-0 [&>.recharts-responsive-container]:overflow-visible"
        initialDimension={{ width: 640, height }}
      >
        <BarChart data={chartData} margin={{ top: 20, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            height={56}
            interval={0}
            tick={WrappedCategoryTick}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={32}
            domain={[0, yAxisMax]}
            allowDecimals={false}
            className="text-[10px]"
          />
          <ChartTooltip
            cursor={{ fill: 'rgba(48, 126, 242, 0.08)' }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
                formatter={(value, _name, item) => (
                  <div className="flex w-full flex-col items-end gap-0.5">
                    <span className="font-mono font-semibold text-foreground">
                      {value} refund{Number(value) !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{item.payload.percent}%</span>
                  </div>
                )}
              />
            }
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56}>
            {chartData.map((entry) => (
              <Cell key={entry.label} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
