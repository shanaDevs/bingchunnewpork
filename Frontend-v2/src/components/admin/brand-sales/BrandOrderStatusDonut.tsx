'use client';

import { useMemo } from 'react';
import { Cell, Pie, PieChart } from 'recharts';

import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import DonutChartCenterLabel from '@/components/admin/DonutChartCenterLabel';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { BRAND_MODE_COLORS } from '@/lib/brandSalesChartColors';

export type BrandOrderStatus = {
  completed: number;
  preparing: number;
  pending: number;
  cancelled: number;
  total?: number;
};

type Props = {
  data?: BrandOrderStatus;
  loading?: boolean;
};

const SLICES = [
  { key: 'completed', label: 'Completed', color: BRAND_MODE_COLORS.delivery },
  { key: 'preparing', label: 'Preparing', color: BRAND_MODE_COLORS.pickup },
  { key: 'cancelled', label: 'Cancelled', color: '#f97316' },
  { key: 'pending', label: 'Pending', color: '#cbd5e1' },
] as const;

const chartConfig = {
  completed: { label: 'Completed', color: BRAND_MODE_COLORS.delivery },
  preparing: { label: 'Preparing', color: BRAND_MODE_COLORS.pickup },
  cancelled: { label: 'Cancelled', color: '#f97316' },
  pending: { label: 'Pending', color: '#cbd5e1' },
} satisfies ChartConfig;

export default function BrandOrderStatusDonut({ data, loading }: Props) {
  const slices = useMemo(() => {
    const counts = {
      completed: data?.completed ?? 0,
      preparing: data?.preparing ?? 0,
      cancelled: data?.cancelled ?? 0,
      pending: data?.pending ?? 0,
    };
    const total = data?.total ?? Object.values(counts).reduce((sum, value) => sum + value, 0);
    return SLICES.map((slice) => ({
      ...slice,
      value: counts[slice.key],
      percent: total > 0 ? Math.round((counts[slice.key] / total) * 100) : 0,
    }));
  }, [data]);

  const total = data?.total ?? slices.reduce((sum, slice) => sum + slice.value, 0);

  if (loading) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3" aria-hidden>
        <DashSkel className="h-[160px] w-[160px] rounded-full" />
        <div className="w-full space-y-2 px-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-2">
              <DashSkel className="h-3 w-24" />
              <DashSkel className="h-3 w-8" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (total === 0) {
    return <p className="flex h-[220px] items-center justify-center text-sm text-muted">No orders in this period</p>;
  }

  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3">
      <div className="h-[160px] w-[160px] shrink-0">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-full w-full [&>.recharts-responsive-container]:h-full"
          initialDimension={{ width: 160, height: 160 }}
        >
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <span className="font-mono font-semibold">{Number(value).toLocaleString()} orders</span>
                  )}
                />
              }
            />
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius={44} outerRadius={64} strokeWidth={0}>
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
              <DonutChartCenterLabel value={total.toLocaleString()} label="Orders" />
            </Pie>
          </PieChart>
        </ChartContainer>
      </div>
      <div className="w-full min-w-0 space-y-1.5 px-1">
        {slices.map((slice) => (
          <div key={slice.key} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} />
              <span className="truncate text-muted">{slice.label}</span>
            </div>
            <span className="shrink-0 font-semibold tabular-nums text-fg">{slice.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
