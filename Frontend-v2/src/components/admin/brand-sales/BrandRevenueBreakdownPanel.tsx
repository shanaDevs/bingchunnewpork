'use client';

import { useMemo } from 'react';
import { Cell, Label, Pie, PieChart } from 'recharts';

import { DonutLegendSkeleton } from '@/components/admin/BranchDashboardSkeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney } from '@/lib/receipt';

type Props = {
  delivery: number;
  pickup: number;
  loading?: boolean;
};

const DELIVERY_COLOR = '#307ef2';
const PICKUP_COLOR = '#93c5fd';

const CHART_SIZE = 168;
const INNER_RADIUS = 48;
const OUTER_RADIUS = 72;

const chartConfig = {
  delivery: { label: 'Delivery Revenue', color: DELIVERY_COLOR },
  pickup: { label: 'Pickup Revenue', color: PICKUP_COLOR },
} satisfies ChartConfig;

function formatRevenueBreakdownCenterTotal(total: number) {
  if (!Number.isFinite(total) || total <= 0) return 'LKR 0';
  if (total >= 1_000_000) return `LKR ${(total / 1_000_000).toFixed(2)}M`;
  return `LKR ${Math.round(total).toLocaleString('en-LK')}`;
}

export default function BrandRevenueBreakdownPanel({
  delivery,
  pickup,
  loading,
}: Props) {
  const slices = useMemo(() => {
    const total = delivery + pickup;
    return [
      { key: 'delivery', label: 'Delivery Revenue', value: delivery, fill: DELIVERY_COLOR },
      { key: 'pickup', label: 'Pickup Revenue', value: pickup, fill: PICKUP_COLOR },
    ].map((slice) => ({
      ...slice,
      percent: total > 0 ? Math.round((slice.value / total) * 100) : 0,
    }));
  }, [delivery, pickup]);

  const total = delivery + pickup;
  const roundedSegments = slices.filter((slice) => slice.value > 0).length > 1;

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="border-b border-[#e2e8f0] px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-fg">Revenue Breakdown</h2>
      </div>
      {loading ? (
        <div className="flex flex-1 items-center px-4 py-3">
          <DonutLegendSkeleton rows={2} size={CHART_SIZE} />
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center gap-4 px-4 py-3 sm:flex-row sm:items-center sm:gap-5">
            <div
              className="mx-auto shrink-0 sm:mx-0"
              style={{ width: CHART_SIZE, height: CHART_SIZE }}
            >
              <ChartContainer
                config={chartConfig}
                className="aspect-square h-full w-full [&>.recharts-responsive-container]:h-full"
                initialDimension={{ width: CHART_SIZE, height: CHART_SIZE }}
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
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={INNER_RADIUS}
                    outerRadius={OUTER_RADIUS}
                    paddingAngle={0}
                    strokeWidth={0}
                    cornerRadius={roundedSegments ? 4 : 0}
                  >
                    {slices.map((slice) => (
                      <Cell key={slice.key} fill={slice.fill} />
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
                              y={cy - 7}
                              style={{ fill: 'var(--color-text)', fontSize: 13, fontWeight: 700 }}
                            >
                              {formatRevenueBreakdownCenterTotal(total)}
                            </tspan>
                            <tspan
                              x={cx}
                              y={cy + 11}
                              style={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 500 }}
                            >
                              Total Sales
                            </tspan>
                          </text>
                        );
                      }}
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>
            </div>
            <div className="flex w-full min-w-0 flex-1 flex-col justify-center space-y-4">
              {slices.map((slice) => (
                <div key={slice.key} className="flex min-w-0 items-start gap-2.5">
                  <span
                    className="mt-0.5 h-3 w-3 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: slice.fill }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{slice.label}</p>
                    <p className="mt-0.5 text-[13px] leading-tight">
                      <span className="font-bold tabular-nums text-fg">{formatMoney(slice.value)}</span>
                      <span className="ml-1 text-[12px] font-medium tabular-nums text-muted">
                        ({slice.percent}%)
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
