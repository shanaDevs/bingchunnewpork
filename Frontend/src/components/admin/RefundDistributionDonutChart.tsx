'use client';

import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart } from 'recharts';

import DonutChartCenterLabel from '@/components/admin/DonutChartCenterLabel';
import DonutChartLegend from '@/components/admin/DonutChartLegend';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export type RefundDistributionPoint = {
  key: string;
  label: string;
  value: number;
  percent: number;
  fill: string;
};

const CHART_SIZE_DEFAULT = 240;
const CHART_SIZE_COMPACT = 168;
const INNER_RADIUS_DEFAULT = 65;
const OUTER_RADIUS_DEFAULT = 88;
const ACTIVE_OUTER_RADIUS_DEFAULT = 94;
const INNER_RADIUS_COMPACT = 48;
const OUTER_RADIUS_COMPACT = 64;
const ACTIVE_OUTER_RADIUS_COMPACT = 70;

const chartConfig = {
  value: { label: 'Count', color: '#307ef2' },
} satisfies ChartConfig;

type Props = {
  data: RefundDistributionPoint[];
  loading?: boolean;
  emptyLabel?: string;
  unitLabel?: string;
  compact?: boolean;
  /** Hide legend when a rank list is shown beside the chart */
  hideLegend?: boolean;
  /** Show sum of slices in the hole instead of the hovered slice. */
  centerMode?: 'active' | 'total';
  centerLabel?: string;
  /** Place legend to the right of the ring (analytics mock). */
  legendSide?: boolean;
};

function truncateCenterLabel(label: string, max = 14): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

export default function RefundDistributionDonutChart({
  data,
  loading,
  emptyLabel = 'No data for this period',
  unitLabel = 'refunds',
  compact = false,
  hideLegend = false,
  centerMode = 'active',
  centerLabel = 'Total',
  legendSide = false,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  const chartSize = compact ? CHART_SIZE_COMPACT : CHART_SIZE_DEFAULT;
  const innerRadius = compact ? INNER_RADIUS_COMPACT : INNER_RADIUS_DEFAULT;
  const outerRadius = compact ? OUTER_RADIUS_COMPACT : OUTER_RADIUS_DEFAULT;
  const activeOuterRadius = compact ? ACTIVE_OUTER_RADIUS_COMPACT : ACTIVE_OUTER_RADIUS_DEFAULT;

  const chartData = useMemo(() => data.filter((item) => item.value > 0), [data]);

  const safeActiveIndex = chartData.length > 0 ? Math.min(activeIndex, chartData.length - 1) : 0;
  const activeItem = chartData[safeActiveIndex];
  const totalValue = chartData.reduce((sum, item) => sum + item.value, 0);
  const centerValue = centerMode === 'total' ? totalValue : activeItem?.value;
  const holeLabel =
    centerMode === 'total' ? centerLabel : activeItem ? truncateCenterLabel(activeItem.label) : centerLabel;

  const chartSlices = useMemo(
    () =>
      chartData.map((item, index) => ({
        ...item,
        sliceRadius: index === safeActiveIndex ? activeOuterRadius : outerRadius,
      })),
    [chartData, safeActiveIndex, activeOuterRadius, outerRadius],
  );

  if (loading) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted shrink-0"
        style={{ width: chartSize, height: chartSize }}
      >
        Loading…
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-dashed border-navy-border/70 text-center text-xs text-muted px-4 shrink-0"
        style={{ width: chartSize, height: chartSize }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className={`flex max-w-full items-center ${
        legendSide ? 'flex-row gap-4' : `flex-col ${compact ? 'gap-1' : ''}`
      }`}
    >
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square shrink-0"
        style={{ width: chartSize, height: chartSize, maxWidth: '100%' }}
        initialDimension={{ width: chartSize, height: chartSize }}
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, _name, item) => (
                  <span className="font-bold">
                    {value} {unitLabel} · {(item.payload as RefundDistributionPoint).percent}%
                  </span>
                )}
              />
            }
          />
          <Pie
            data={chartSlices}
            dataKey="value"
            nameKey="label"
            innerRadius={innerRadius}
            outerRadius={(entry) => entry.sliceRadius}
            paddingAngle={chartData.length > 1 ? 4 : 0}
            strokeWidth={0}
            onMouseEnter={(_, index) => setActiveIndex(index)}
          >
            {chartSlices.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} />
            ))}
            {centerValue != null && (
              <DonutChartCenterLabel value={centerValue} label={holeLabel} />
            )}
          </Pie>
        </PieChart>
      </ChartContainer>
      {!hideLegend && (
        <DonutChartLegend
          stacked={compact && !legendSide}
          side={legendSide}
          items={chartData.map((item) => ({
            key: item.key,
            label: item.label,
            color: item.fill,
            percent: item.percent,
            count: item.value,
          }))}
        />
      )}
    </div>
  );
}
