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

export type PlatformChartPoint = {
  key: string;
  label: string;
  count: number;
  percent: number;
  fill: string;
};

const CHART_SIZE = 240;
const INNER_RADIUS = 65;
const OUTER_RADIUS = 88;
const ACTIVE_OUTER_RADIUS = 94;

const chartConfig = {
  web: { label: 'Web', color: '#307ef2' },
  mobile: { label: 'Mobile App', color: '#f97316' },
} satisfies ChartConfig;

type Props = {
  data: PlatformChartPoint[];
  loading?: boolean;
};

export default function OrderPlatformDonutChart({ data, loading }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  const chartData = useMemo(() => data.filter((item) => item.count > 0), [data]);

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
        No platform data
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
                    {value} orders · {(item.payload as PlatformChartPoint).percent}%
                  </span>
                )}
              />
            }
          />
          <Pie
            data={chartSlices}
            dataKey="count"
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
              <DonutChartCenterLabel value={activeItem.count} label={activeItem.label} />
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
