'use client';

import { Truck } from 'lucide-react';
import { PolarGrid, RadialBar, RadialBarChart } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney } from '@/lib/receipt';

const chartConfig = {
  delivery: {
    label: 'Delivery',
    color: '#f97316',
  },
  takeaway: {
    label: 'Takeaway',
    color: '#307ef2',
  },
} satisfies ChartConfig;

type ModeStats = {
  orders: number;
  revenue: number;
};

type Props = {
  delivery: ModeStats;
  takeaway: ModeStats;
  periodLabel: string;
  loading?: boolean;
};

export default function OrderModeSplitCard({
  delivery,
  takeaway,
  periodLabel,
  loading,
}: Props) {
  const totalOrders = delivery.orders + takeaway.orders;
  const deliveryPct = totalOrders > 0 ? Math.round((delivery.orders / totalOrders) * 100) : 0;
  const takeawayPct = totalOrders > 0 ? 100 - deliveryPct : 0;

  const chartData = [
    { mode: 'delivery', share: deliveryPct, fill: 'var(--color-delivery)' },
    { mode: 'takeaway', share: takeawayPct, fill: 'var(--color-takeaway)' },
  ];

  const legend = [
    {
      key: 'delivery',
      label: 'Delivery',
      color: chartConfig.delivery.color,
      pct: deliveryPct,
      orders: delivery.orders,
      revenue: delivery.revenue,
    },
    {
      key: 'takeaway',
      label: 'Takeaway',
      color: chartConfig.takeaway.color,
      pct: takeawayPct,
      orders: takeaway.orders,
      revenue: takeaway.revenue,
    },
  ];

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="border-b border-navy-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Truck size={16} className="text-orange-400" />
          Order Mode Split
        </h2>
        <p className="mt-0.5 text-xs text-muted">{periodLabel} · by order count</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-5 py-5 sm:flex-row sm:items-center sm:gap-6">
        {loading ? (
          <div className="flex h-36 w-full items-center justify-center text-sm text-muted">
            Loading…
          </div>
        ) : totalOrders <= 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="mb-3 h-28 w-28 rounded-full border-2 border-dashed border-navy-border" />
            <p className="text-xs text-muted">No orders in this period</p>
          </div>
        ) : (
          <>
            <div className="relative mx-auto aspect-square w-full max-w-[220px] shrink-0">
              <ChartContainer
                config={chartConfig}
                className="mx-auto aspect-square h-[220px] w-full"
                initialDimension={{ width: 220, height: 220 }}
              >
                <RadialBarChart
                  data={chartData}
                  startAngle={90}
                  endAngle={-270}
                  innerRadius={58}
                  outerRadius={98}
                >
                  <PolarGrid
                    gridType="circle"
                    radialLines={false}
                    stroke="none"
                    className="first:fill-navy-light/40 last:fill-navy-card"
                    polarRadius={[62, 54]}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        nameKey="mode"
                        formatter={(value, name) => {
                          const label =
                            chartConfig[name as keyof typeof chartConfig]?.label ?? name;
                          const item = legend.find((l) => l.key === name);
                          return (
                            <div className="flex w-full flex-col items-end gap-0.5">
                              <span className="font-medium text-foreground">{label}</span>
                              <span className="font-mono font-semibold text-foreground">
                                {item?.orders ?? 0} orders · {Number(value)}%
                              </span>
                            </div>
                          );
                        }}
                      />
                    }
                  />
                  <RadialBar
                    dataKey="share"
                    background={{ fill: 'var(--color-navy-light, rgba(148,163,184,0.15))' }}
                    cornerRadius={8}
                  />
                </RadialBarChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[9px] font-medium uppercase tracking-wide text-muted">
                  Total
                </span>
                <span className="text-lg font-bold tabular-nums text-fg">{totalOrders}</span>
                <span className="text-[10px] text-muted">orders</span>
              </div>
            </div>

            <ul className="w-full max-w-[220px] space-y-3">
              {legend.map((item) => (
                <li key={item.key}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate text-muted">{item.label}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-fg">{item.pct}%</span>
                  </div>
                  <p className="pl-[18px] text-[11px] font-medium text-fg">
                    {item.orders} orders · {formatMoney(item.revenue)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
