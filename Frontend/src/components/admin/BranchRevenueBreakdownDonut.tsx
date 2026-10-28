'use client';

import { useMemo } from 'react';
import { Cell, Pie, PieChart } from 'recharts';

import DonutChartCenterLabel from '@/components/admin/DonutChartCenterLabel';
import DonutChartLegend from '@/components/admin/DonutChartLegend';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';

export type RevenueChannelKey = 'pickupCash' | 'pickupCard' | 'pickupOnline' | 'deliveryCard';

export type RevenueChannels = Record<RevenueChannelKey, number>;

const CHANNELS: Array<{ key: RevenueChannelKey; label: string; color: string }> = [
  { key: 'pickupCash', label: 'Pickup Cash', color: '#1e3a8a' },
  { key: 'pickupCard', label: 'Pickup Card', color: '#2563eb' },
  { key: 'pickupOnline', label: 'Pickup Online', color: '#307ef2' },
  { key: 'deliveryCard', label: 'Delivery Online', color: '#93c5fd' },
];

const CHART_SIZE = 168;
const INNER_RADIUS = 48;
const OUTER_RADIUS = 68;

const chartConfig = {
  pickupCash: { label: 'Pickup Cash', color: '#1e3a8a' },
  pickupCard: { label: 'Pickup Card', color: '#2563eb' },
  pickupOnline: { label: 'Pickup Online', color: '#307ef2' },
  deliveryCard: { label: 'Delivery Online', color: '#93c5fd' },
} satisfies ChartConfig;

type Slice = {
  key: RevenueChannelKey;
  label: string;
  value: number;
  percent: number;
  fill: string;
};

type Props = {
  channels: RevenueChannels | null | undefined;
  totalRevenue?: number | null;
  hideDelivery?: boolean;
  loading?: boolean;
};

export default function BranchRevenueBreakdownDonut({
  channels,
  totalRevenue,
  hideDelivery = false,
  loading,
}: Props) {
  const slices = useMemo<Slice[]>(() => {
    const visible = hideDelivery
      ? CHANNELS.filter((channel) => channel.key !== 'deliveryCard')
      : CHANNELS;
    const total = visible.reduce((sum, channel) => sum + (channels?.[channel.key] ?? 0), 0);
    return visible
      .map((channel) => {
        const value = channels?.[channel.key] ?? 0;
        return {
          key: channel.key,
          label: channel.label,
          value,
          percent: total > 0 ? Math.round((value / total) * 100) : 0,
          fill: channel.color,
        };
      })
      .filter((slice) => slice.value > 0);
  }, [channels, hideDelivery]);

  const centerTotal = totalRevenue ?? slices.reduce((sum, slice) => sum + slice.value, 0);

  if (loading) {
    return (
      <div className="flex min-h-[168px] items-center justify-center text-sm text-muted">
        Loading chart…
      </div>
    );
  }

  if (slices.length === 0) {
    return (
      <div className="flex min-h-[168px] items-center justify-center text-sm text-muted">
        No channel revenue for this period
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square shrink-0"
        style={{ width: CHART_SIZE, height: CHART_SIZE }}
        initialDimension={{ width: CHART_SIZE, height: CHART_SIZE }}
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, _name, item) => (
                  <span className="font-bold">
                    {formatMoney(Number(value))} · {(item.payload as Slice).percent}%
                  </span>
                )}
              />
            }
          />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius={INNER_RADIUS}
            outerRadius={OUTER_RADIUS}
            paddingAngle={slices.length > 1 ? 3 : 0}
            strokeWidth={0}
          >
            {slices.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} />
            ))}
            <DonutChartCenterLabel value={formatMoneyAmount(centerTotal)} label="Total" />
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="min-w-0 sm:-mt-4">
        <DonutChartLegend
          stacked
          items={slices.map((item) => ({
            key: item.key,
            label: item.label,
            color: item.fill,
            percent: item.percent,
          }))}
        />
      </div>
    </div>
  );
}
