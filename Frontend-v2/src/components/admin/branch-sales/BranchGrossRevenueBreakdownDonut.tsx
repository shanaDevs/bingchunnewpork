'use client';

import { useMemo } from 'react';
import { Cell, Label, Pie, PieChart } from 'recharts';

import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { BranchGrossRevenueBreakdown } from '@/lib/branchSalesOverview';
import { BRAND_GROSS_REVENUE_SLICE_COLORS } from '@/lib/brandSalesChartColors';
import { formatMoney } from '@/lib/receipt';

export type { BranchGrossRevenueBreakdown };

type Props = {
  data?: BranchGrossRevenueBreakdown;
  loading?: boolean;
  hideDelivery?: boolean;
};

const SLICES = [
  { key: 'productSales', label: 'Product Sales', color: BRAND_GROSS_REVENUE_SLICE_COLORS.productSales },
  { key: 'delivery', label: 'Delivery Charges', color: BRAND_GROSS_REVENUE_SLICE_COLORS.delivery },
  { key: 'convenience', label: 'Convenience Fees', color: BRAND_GROSS_REVENUE_SLICE_COLORS.convenience },
  { key: 'other', label: 'Other', color: BRAND_GROSS_REVENUE_SLICE_COLORS.other },
] as const;

const chartConfig = {
  productSales: { label: 'Product Sales', color: BRAND_GROSS_REVENUE_SLICE_COLORS.productSales },
  delivery: { label: 'Delivery Charges', color: BRAND_GROSS_REVENUE_SLICE_COLORS.delivery },
  convenience: { label: 'Convenience Fees', color: BRAND_GROSS_REVENUE_SLICE_COLORS.convenience },
  other: { label: 'Other', color: BRAND_GROSS_REVENUE_SLICE_COLORS.other },
} satisfies ChartConfig;

function formatCenterTotal(total: number) {
  if (!Number.isFinite(total) || total <= 0) return 'LKR 0';
  if (total >= 1_000_000) return `LKR ${(total / 1_000_000).toFixed(2)}M`;
  return formatMoney(total);
}

export default function BranchGrossRevenueBreakdownDonut({
  data,
  loading,
  hideDelivery = false,
}: Props) {
  const slices = useMemo(() => {
    const values = {
      productSales: data?.productSales ?? 0,
      delivery: hideDelivery ? 0 : (data?.delivery ?? 0),
      convenience: data?.convenience ?? 0,
      other: data?.other ?? 0,
    };
    const visible = hideDelivery ? SLICES.filter((slice) => slice.key !== 'delivery') : SLICES;
    const total = visible.reduce((sum, slice) => sum + values[slice.key], 0);
    return visible.map((slice) => ({
      ...slice,
      value: values[slice.key],
      percent: total > 0 ? Math.round((values[slice.key] / total) * 100) : 0,
    }));
  }, [data, hideDelivery]);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (loading) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3" aria-hidden>
        <DashSkel className="h-[160px] w-[160px] rounded-full" />
        <div className="w-full space-y-2 px-1">
          {Array.from({ length: hideDelivery ? 3 : 4 }).map((_, index) => (
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
    return <p className="flex h-[220px] items-center justify-center text-sm text-muted">No revenue in this period</p>;
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
                  formatter={(value, _name, item) => {
                    const row = item.payload as (typeof slices)[number];
                    return (
                      <span className="font-mono font-semibold">
                        {formatMoney(Number(value))}
                        <span className="ml-1 text-muted-foreground">({row.percent}%)</span>
                      </span>
                    );
                  }}
                />
              }
            />
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius={44} outerRadius={64} strokeWidth={0}>
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
              <Label
                position="center"
                content={({ viewBox }) => {
                  if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null;
                  const cx = viewBox.cx ?? 0;
                  const cy = viewBox.cy ?? 0;
                  return (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan
                        x={cx}
                        y={cy - 6}
                        style={{ fill: 'var(--color-text)', fontSize: 11, fontWeight: 700 }}
                      >
                        {formatCenterTotal(total)}
                      </tspan>
                      <tspan
                        x={cx}
                        y={cy + 10}
                        style={{ fill: 'var(--color-text-muted)', fontSize: 10, fontWeight: 500 }}
                      >
                        Revenue
                      </tspan>
                    </text>
                  );
                }}
              />
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
