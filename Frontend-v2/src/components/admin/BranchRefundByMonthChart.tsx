'use client';

import { useMemo } from 'react';
import { Undo2 } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import SuperAdminAnalyticsChartCard, {
  SUPER_ADMIN_CHART_CONTAINER_CLASS,
  SUPER_ADMIN_CHART_HEIGHT,
} from '@/components/admin/SuperAdminAnalyticsChartCard';
import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney } from '@/lib/receipt';

export type BranchRefundByMonthPoint = {
  month: string;
  count: number;
  amountLkr: number;
};

const REFUND_COLOR = '#ef4444';

const chartConfig = {
  count: {
    label: 'Refunds',
    color: REFUND_COLOR,
  },
} satisfies ChartConfig;

type Props = {
  data: BranchRefundByMonthPoint[];
  periodLabel: string;
  loading?: boolean;
};

function shortMonth(label: string) {
  return label.split(' ')[0] ?? label;
}

export default function BranchRefundByMonthChart({ data, periodLabel, loading }: Props) {
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        month: shortMonth(point.month),
        fullMonth: point.month,
        count: point.count,
        amountLkr: point.amountLkr,
      })),
    [data],
  );
  const totalAmount = data.reduce((sum, point) => sum + point.amountLkr, 0);
  const maxCount = Math.max(...chartData.map((point) => point.count), 0);
  const hasData = chartData.some((point) => point.count > 0 || point.amountLkr > 0);

  return (
    <SuperAdminAnalyticsChartCard
      icon={<Undo2 size={16} strokeWidth={2.25} aria-hidden />}
      iconClassName="bg-rose-500/10 text-rose-500"
      title="Refunds by month"
      subtitle={`${periodLabel} · completed refunds`}
      headerRight={
        loading ? (
          <DashSkel className="h-5 w-28" />
        ) : hasData ? (
          <span className="shrink-0 text-sm font-bold tabular-nums text-rose-500 sm:text-base">
            {formatMoney(totalAmount)}
          </span>
        ) : null
      }
      loading={loading}
      empty={!hasData}
      emptyLabel="No refunds in this period"
      skeletonRows={5}
    >
      <ChartContainer
        config={chartConfig}
        className={SUPER_ADMIN_CHART_CONTAINER_CLASS}
        style={{ height: SUPER_ADMIN_CHART_HEIGHT }}
        initialDimension={{ width: 420, height: SUPER_ADMIN_CHART_HEIGHT }}
      >
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="fillBranchRefundCount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-count, #ef4444)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-count, #ef4444)" stopOpacity={0.02} />
            </linearGradient>
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
            width={36}
            domain={[0, maxCount > 0 ? 'auto' : 1]}
            allowDecimals={false}
            className="text-[11px]"
          />
          <ChartTooltip
            cursor={{
              stroke: 'var(--color-count, #ef4444)',
              strokeWidth: 1,
              strokeDasharray: '4 4',
            }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullMonth ?? ''}
                formatter={(value, _name, item) => (
                  <div className="flex w-full flex-col items-end gap-0.5">
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">Refunds</span>
                      <span className="font-mono font-semibold text-foreground">
                        {Number(value)} refund{Number(value) !== 1 ? 's' : ''}
                      </span>
                    </div>
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
            fill="url(#fillBranchRefundCount)"
            stroke="var(--color-count, #ef4444)"
            strokeWidth={2}
            dot={{ fill: 'var(--color-count, #ef4444)', r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
          />
        </AreaChart>
      </ChartContainer>
    </SuperAdminAnalyticsChartCard>
  );
}
