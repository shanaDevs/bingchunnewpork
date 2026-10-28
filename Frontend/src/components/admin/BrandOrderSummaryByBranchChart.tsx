'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';
import { ChartBarsSkeleton } from '@/components/admin/BranchDashboardSkeleton';
import BrandedChartTooltipShell from '@/components/ui/BrandedChartTooltipShell';
import { shortBranchName } from '@/lib/branchName';
import { BRAND_ORDER_CHANNEL_COLORS } from '@/lib/brandSalesChartColors';
import { formatMoney } from '@/lib/receipt';

export type BranchOrderSummaryPoint = {
  label: string;
  delivery: number;
  pickupCash: number;
  pickupOnline: number;
  pickupCard: number;
  orderCount?: number;
  grossSales?: number;
};

const chartConfig = {
  delivery: { label: 'Delivery', color: BRAND_ORDER_CHANNEL_COLORS.delivery },
  pickupCard: { label: 'Pickup Card', color: BRAND_ORDER_CHANNEL_COLORS.pickupCard },
  pickupCash: { label: 'Pickup Cash', color: BRAND_ORDER_CHANNEL_COLORS.pickupCash },
  pickupOnline: { label: 'Pickup Online', color: BRAND_ORDER_CHANNEL_COLORS.pickupOnline },
} satisfies ChartConfig;

function formatBranchAxisLabel(name: string) {
  const maxLength = 10;
  if (name.length > maxLength) return `${name.slice(0, maxLength)}…`;
  return name;
}

function BranchAxisTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const label = formatBranchAxisLabel(String(payload?.value ?? ''));

  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject x={-46} y={2} width={92} height={18}>
        <div
          style={{
            width: 92,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'center',
            fontSize: 11,
            lineHeight: '18px',
            color: 'currentColor',
          }}
        >
          {label}
        </div>
      </foreignObject>
    </g>
  );
}

type ChartRow = BranchOrderSummaryPoint & {
  branch: string;
  channelTotal: number;
  orders: number;
  grossSales: number;
};

function BrandOrderSummaryTooltip({
  active,
  payload,
  periodLabel,
  pickupOnly,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; payload?: ChartRow }>;
  periodLabel: string;
  pickupOnly: boolean;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  const channelKeys = pickupOnly
    ? (['pickupCard', 'pickupCash', 'pickupOnline'] as const)
    : (['delivery', 'pickupCard', 'pickupCash', 'pickupOnline'] as const);

  const items = channelKeys.map((key) => ({
    key,
    label: chartConfig[key].label,
    value: row[key],
    color: chartConfig[key].color,
  }));

  return (
    <BrandedChartTooltipShell className="min-w-40">
      <div className="font-medium text-foreground">{row.label}</div>
      {periodLabel ? (
        <div className="text-[10px] text-muted-foreground">{periodLabel}</div>
      ) : null}
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
              {formatMoney(item.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border/50 pt-1.5 font-semibold text-foreground">
        <span>Total</span>
        <span className="font-mono tabular-nums">{formatMoney(row.channelTotal)}</span>
      </div>
    </BrandedChartTooltipShell>
  );
}

function formatAxisAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return `${Math.round(value)}`;
}

type Props = {
  data: BranchOrderSummaryPoint[];
  periodLabel: string;
  loading?: boolean;
  pickupOnly?: boolean;
  maxBranches?: number;
  sortBy?: 'revenue' | 'orders';
  compact?: boolean;
};

export default function BrandOrderSummaryByBranchChart({
  data,
  periodLabel,
  loading,
  pickupOnly = false,
  maxBranches,
  sortBy = 'revenue',
  compact = false,
}: Props) {
  const chartData = useMemo(() => {
    const mapped = data.map((point) => ({
      ...point,
      branch: shortBranchName(point.label),
      channelTotal: pickupOnly
        ? point.pickupCash + point.pickupOnline + point.pickupCard
        : point.delivery + point.pickupCash + point.pickupOnline + point.pickupCard,
      orders: point.orderCount ?? 0,
      grossSales: point.grossSales ?? (
        pickupOnly
          ? point.pickupCash + point.pickupOnline + point.pickupCard
          : point.delivery + point.pickupCash + point.pickupOnline + point.pickupCard
      ),
    }));
    const withSales = mapped.filter((point) =>
      sortBy === 'orders' ? point.orders > 0 : point.grossSales > 0,
    );
    const sorted = [...withSales].sort((a, b) =>
      sortBy === 'orders' ? b.orders - a.orders : b.grossSales - a.grossSales,
    );
    return maxBranches ? sorted.slice(0, maxBranches) : sorted;
  }, [data, pickupOnly, maxBranches, sortBy]);

  const chartHeight = compact ? 200 : 320;

  if (loading) {
    return <ChartBarsSkeleton minHeight={chartHeight} />;
  }

  if (chartData.length === 0 || chartData.every((point) => point.grossSales === 0)) {
    return (
      <div className="flex items-center justify-center text-sm text-muted" style={{ height: chartHeight }}>
        No sales data for this period
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
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
          barCategoryGap="22%"
          barGap={2}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="branch"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            height={28}
            interval={0}
            minTickGap={12}
            tick={<BranchAxisTick />}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={48}
            tickFormatter={formatAxisAmount}
            className="text-[10px]"
          />
          <ChartTooltip
            cursor={{ fill: 'rgba(17,46,129,0.06)' }}
            content={
              <BrandOrderSummaryTooltip periodLabel={periodLabel} pickupOnly={pickupOnly} />
            }
          />
          <Legend
            iconType="square"
            iconSize={8}
            formatter={(value) =>
              chartConfig[value as keyof typeof chartConfig]?.label ?? value
            }
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          {!pickupOnly && (
            <Bar dataKey="delivery" fill="var(--color-delivery)" radius={[3, 3, 0, 0]} maxBarSize={12} />
          )}
          <Bar dataKey="pickupCard" fill="var(--color-pickupCard)" radius={[3, 3, 0, 0]} maxBarSize={12} />
          <Bar dataKey="pickupCash" fill="var(--color-pickupCash)" radius={[3, 3, 0, 0]} maxBarSize={12} />
          <Bar dataKey="pickupOnline" fill="var(--color-pickupOnline)" radius={[3, 3, 0, 0]} maxBarSize={12} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
