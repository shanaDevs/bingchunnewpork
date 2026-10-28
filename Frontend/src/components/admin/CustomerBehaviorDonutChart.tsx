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

export type BehaviorChartPoint = {
  key: string;
  label: string;
  value: number;
  percent: number;
  fill: string;
};

const CHART_SIZE = 240;
const INNER_RADIUS = 65;
const OUTER_RADIUS = 88;
const ACTIVE_OUTER_RADIUS = 94;

const chartConfig = {
  firstTime: { label: 'First-time', color: '#6366f1' },
  loyal: { label: 'Loyal', color: '#ec4899' },
} satisfies ChartConfig;

type Props = {
  data: BehaviorChartPoint[];
  loading?: boolean;
};

export default function CustomerBehaviorDonutChart({ data, loading }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  const chartData = useMemo(() => data.filter((item) => item.value > 0), [data]);

  const safeActiveIndex = chartData.length > 0 ? Math.min(activeIndex, chartData.length - 1) : 0;
  const activeItem = chartData[safeActiveIndex];

  const chartSlices = useMemo(
    () =>
      chartData.map((item, index) => ({
        ...item,
        sliceRadius: index === safeActiveIndex ? ACTIVE_OUTER_RADIUS : OUTER_RADIUS,
      })),
    [chartData, safeActiveIndex],
  );

  if (loading) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted"
        style={{ width: CHART_SIZE, height: CHART_SIZE }}
      >
        Loading…
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-dashed border-navy-border/70 text-center text-xs text-muted"
        style={{ width: CHART_SIZE, height: CHART_SIZE }}
      >
        No customer data
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
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
                    {value} customers · {(item.payload as BehaviorChartPoint).percent}%
                  </span>
                )}
              />
            }
          />
          <Pie
            data={chartSlices}
            dataKey="value"
            nameKey="label"
            innerRadius={INNER_RADIUS}
            outerRadius={(entry) => entry.sliceRadius}
            paddingAngle={chartData.length > 1 ? 4 : 0}
            strokeWidth={0}
            onMouseEnter={(_, index) => setActiveIndex(index)}
          >
            {chartSlices.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} />
            ))}
            {activeItem && (
              <DonutChartCenterLabel value={activeItem.value} label={activeItem.label} />
            )}
          </Pie>
        </PieChart>
      </ChartContainer>
      <DonutChartLegend
        items={chartData.map((item) => ({
          key: item.key,
          label: item.label,
          color: item.fill,
          percent: item.percent,
        }))}
      />
    </div>
  );
}
