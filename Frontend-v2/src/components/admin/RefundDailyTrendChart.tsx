'use client';

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney } from '@/lib/receipt';

export type RefundDailyTrendPoint = {
  date: string;
  count: number;
  amountLkr: number;
};

const chartConfig = {
  count: {
    label: 'Refunds',
    color: '#307ef2',
  },
} satisfies ChartConfig;

function shortDate(label: string) {
  try {
    return format(parseISO(label), 'MMM d');
  } catch {
    return label;
  }
}

type Props = {
  data: RefundDailyTrendPoint[];
  loading?: boolean;
  compact?: boolean;
};

export default function RefundDailyTrendChart({ data, loading, compact = false }: Props) {
  const chartHeight = compact ? 220 : 320;

  const chartData = useMemo(
    () =>
      data.map((point) => ({
        date: shortDate(point.date),
        fullDate: point.date,
        count: point.count,
        amountLkr: point.amountLkr,
      })),
    [data],
  );

  const maxCount = useMemo(() => Math.max(...chartData.map((d) => d.count), 0), [chartData]);

  const yAxisMax = useMemo(() => {
    if (maxCount <= 0) return 1;
    return Math.max(Math.ceil(maxCount * 1.15), maxCount + 1);
  }, [maxCount]);

  if (loading) {
    return (
      <div
        className="flex w-full min-w-0 items-center justify-center rounded-lg border border-dashed border-navy-border/60 bg-white/[0.02] text-sm text-muted"
        style={{ height: chartHeight }}
      >
        Loading chart…
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div
        className="flex w-full min-w-0 items-center justify-center rounded-lg border border-dashed border-navy-border/60 bg-white/[0.02] text-sm text-muted"
        style={{ height: chartHeight }}
      >
        No refund activity for this period
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 rounded-lg" style={{ height: chartHeight }}>
      <ChartContainer
        config={chartConfig}
        className="!aspect-auto flex h-full w-full min-w-0 max-w-none [&>.recharts-responsive-container]:!h-full [&>.recharts-responsive-container]:!w-full [&>.recharts-responsive-container]:min-h-0"
        initialDimension={{ width: 1200, height: chartHeight }}
      >
        <AreaChart data={chartData} margin={{ top: 20, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="fillRefundCount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-count, #307ef2)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-count, #307ef2)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="date"
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
            domain={[0, yAxisMax]}
            allowDecimals={false}
            className="text-[11px]"
          />
          <ChartTooltip
            cursor={{ stroke: 'var(--color-count, #307ef2)', strokeWidth: 1, strokeDasharray: '4 4' }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const fullDate = payload?.[0]?.payload?.fullDate;
                  return fullDate ? format(parseISO(fullDate), 'MMM d, yyyy') : '';
                }}
                formatter={(value, _name, item) => (
                  <div className="flex w-full flex-col items-end gap-0.5">
                    <span className="font-mono font-semibold text-foreground">
                      {value} refund{Number(value) !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatMoney(Number(item.payload.amountLkr))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Area
            dataKey="count"
            type="monotone"
            fill="url(#fillRefundCount)"
            stroke="var(--color-count, #307ef2)"
            strokeWidth={2}
            dot={{ fill: 'var(--color-count, #307ef2)', r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
