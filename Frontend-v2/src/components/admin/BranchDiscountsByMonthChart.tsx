'use client';

import { useMemo } from 'react';
import { Percent } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import SuperAdminAnalyticsChartCard, {
  SUPER_ADMIN_CHART_CONTAINER_CLASS,
  SUPER_ADMIN_CHART_HEIGHT,
} from '@/components/admin/SuperAdminAnalyticsChartCard';
import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import { formatAxisAmount } from '@/components/admin/wallet-analysis/formatAxisAmount';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney } from '@/lib/receipt';

export type BranchDiscountByMonthPoint = {
  month: string;
  totalDiscount: number;
};

const DISCOUNT_COLOR = '#121358';

const chartConfig = {
  totalDiscount: {
    label: 'Discounts',
    color: DISCOUNT_COLOR,
  },
} satisfies ChartConfig;

type Props = {
  data: BranchDiscountByMonthPoint[];
  periodLabel: string;
  loading?: boolean;
};

function shortMonth(label: string) {
  return label.split(' ')[0] ?? label;
}

export default function BranchDiscountsByMonthChart({ data, periodLabel, loading }: Props) {
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        month: shortMonth(point.month),
        fullMonth: point.month,
        totalDiscount: point.totalDiscount,
      })),
    [data],
  );
  const total = data.reduce((sum, point) => sum + point.totalDiscount, 0);
  const hasData = chartData.some((point) => point.totalDiscount > 0);

  return (
    <SuperAdminAnalyticsChartCard
      icon={<Percent size={16} strokeWidth={2.25} aria-hidden />}
      iconClassName="bg-[rgba(18,19,88,0.10)] text-[#121358]"
      title="Discounts by month"
      subtitle={`${periodLabel} · promo discounts`}
      headerRight={
        loading ? (
          <DashSkel className="h-5 w-28" />
        ) : hasData ? (
          <span className="shrink-0 text-sm font-bold tabular-nums text-[#121358] sm:text-base">
            {formatMoney(total)}
          </span>
        ) : null
      }
      loading={loading}
      empty={!hasData}
      emptyLabel="No promo discounts in this period"
      skeletonRows={5}
    >
      <ChartContainer
        config={chartConfig}
        className={SUPER_ADMIN_CHART_CONTAINER_CLASS}
        style={{ height: SUPER_ADMIN_CHART_HEIGHT }}
        initialDimension={{ width: 420, height: SUPER_ADMIN_CHART_HEIGHT }}
      >
        <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
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
            width={40}
            tickFormatter={formatAxisAmount}
            domain={[0, (dataMax: number) => Math.max(dataMax * 1.15, 1)]}
            className="text-[11px]"
          />
          <ChartTooltip
            cursor={{ fill: 'rgba(148,163,184,0.10)' }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullMonth ?? ''}
                formatter={(value) => (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">Discounts</span>
                    <span className="font-mono font-semibold tabular-nums text-foreground">
                      {formatMoney(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Bar
            dataKey="totalDiscount"
            fill="var(--color-totalDiscount, #121358)"
            radius={[6, 6, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ChartContainer>
    </SuperAdminAnalyticsChartCard>
  );
}
