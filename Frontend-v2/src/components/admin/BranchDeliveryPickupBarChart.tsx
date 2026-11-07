'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { ChartBarsSkeleton } from '@/components/admin/BranchDashboardSkeleton';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';
import BrandedChartTooltipShell from '@/components/ui/BrandedChartTooltipShell';
import { shortBranchName } from '@/lib/branchName';
import { BRAND_MODE_COLORS } from '@/lib/brandSalesChartColors';

export type BranchDeliveryPickupPoint = {
  branchName: string;
  delivery: number;
  pickup: number;
};

const chartConfig = {
  delivery: { label: 'Delivery', color: BRAND_MODE_COLORS.delivery },
  pickup: { label: 'Pickup', color: BRAND_MODE_COLORS.pickup },
} satisfies ChartConfig;

type TooltipPayload = {
  branchName: string;
  delivery: number;
  pickup: number;
  total: number;
};

function BranchDeliveryPickupTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string; payload?: TooltipPayload }>;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  const items = [
    { key: 'delivery', label: chartConfig.delivery.label, value: row.delivery, color: chartConfig.delivery.color },
    { key: 'pickup', label: chartConfig.pickup.label, value: row.pickup, color: chartConfig.pickup.color },
  ];

  return (
    <BrandedChartTooltipShell className="min-w-36">
      <div className="font-medium text-foreground">{row.branchName}</div>
      <div className="grid gap-1.5">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.label}</span>
            </div>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {item.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border/50 pt-1.5 font-semibold text-foreground">
        <span>Total</span>
        <span className="font-mono tabular-nums">{row.total.toLocaleString()}</span>
      </div>
    </BrandedChartTooltipShell>
  );
}

type Props = {
  data: BranchDeliveryPickupPoint[];
  loading?: boolean;
  maxBranches?: number;
  compact?: boolean;
};

export default function BranchDeliveryPickupBarChart({ data, loading, maxBranches, compact = false }: Props) {
  const chartHeight = compact ? 220 : 320;
  const chartData = useMemo(
    () =>
      data
        .map((point) => ({
          ...point,
          label: shortBranchName(point.branchName),
          total: point.delivery + point.pickup,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, maxBranches ?? data.length),
    [data, maxBranches],
  );

  if (loading) {
    return <ChartBarsSkeleton minHeight={chartHeight} />;
  }

  if (chartData.length === 0 || chartData.every((point) => point.total === 0)) {
    return (
      <div className="flex items-center justify-center text-sm text-muted" style={{ height: chartHeight }}>
        No orders in this period
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-full w-full [&>.recharts-responsive-container]:min-h-0 [&>.recharts-responsive-container]:h-full [&>.recharts-responsive-container]:w-full"
        initialDimension={{ width: compact ? 640 : 960, height: chartHeight }}
      >
        <BarChart accessibilityLayer data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            height={28}
            className="text-[10px]"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={32}
            allowDecimals={false}
            className="text-[10px]"
          />
          <ChartTooltip cursor={false} content={<BranchDeliveryPickupTooltip />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="delivery" fill="var(--color-delivery)" radius={4} maxBarSize={36} />
          <Bar dataKey="pickup" fill="var(--color-pickup)" radius={4} maxBarSize={36} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
