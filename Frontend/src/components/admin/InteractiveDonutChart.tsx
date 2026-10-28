'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Cell, Label, Pie, PieChart } from 'recharts';

import { DonutLegendSkeleton } from '@/components/admin/BranchDashboardSkeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';

export type InteractiveDonutSlice<K extends string = string> = {
  key: K;
  label: string;
  amount: number;
  percent: number;
  fill: string;
};

type Props<K extends string> = {
  title: string;
  subtitle?: string;
  loading?: boolean;
  empty?: boolean;
  emptyLabel: string;
  skeletonRows?: number;
  compact?: boolean;
  slices: InteractiveDonutSlice<K>[];
  pieSlices?: InteractiveDonutSlice<K>[];
  chartConfig: ChartConfig;
  defaultKey?: K;
  paddingAngle?: number;
  strokeWidth?: number;
  stroke?: string;
  useCells?: boolean;
  centerCaption?: (slice: InteractiveDonutSlice<K>) => string;
  centerCaptionClassName?: string;
  footer?: ReactNode;
};

export default function InteractiveDonutChart<K extends string>({
  title,
  subtitle,
  loading,
  empty,
  emptyLabel,
  skeletonRows,
  compact = false,
  slices,
  pieSlices,
  chartConfig,
  defaultKey,
  paddingAngle = 0,
  strokeWidth = 5,
  stroke = 'var(--color-surface)',
  useCells = false,
  centerCaption,
  centerCaptionClassName = 'fill-muted-foreground text-[11px]',
  footer,
}: Props<K>) {
  const pieData = pieSlices ?? slices;
  const [activeKey, setActiveKey] = useState<K | undefined>(defaultKey ?? slices[0]?.key);
  const chartSize = compact ? 168 : 250;
  const emptyMinHeight = compact ? 'min-h-[180px]' : 'min-h-[220px]';

  const activeItem = useMemo(
    () => slices.find((slice) => slice.key === activeKey) ?? pieData[0] ?? slices[0],
    [activeKey, pieData, slices],
  );

  useEffect(() => {
    const keys = slices.map((slice) => slice.key);
    if (keys.length === 0) return;
    if (!activeKey || !keys.includes(activeKey)) {
      setActiveKey((pieData[0] ?? slices[0]).key);
    }
  }, [activeKey, pieData, slices]);

  return (
    <div className={`card flex h-full flex-col ${compact ? 'p-4' : 'p-5'}`}>
      <div className={compact ? 'mb-2' : 'mb-1'}>
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p> : null}
      </div>

      {loading ? (
        <DonutLegendSkeleton
          rows={skeletonRows ?? Math.max(slices.length, 2)}
          minHeight={compact ? 180 : 220}
        />
      ) : empty || pieData.length === 0 ? (
        <div className={`flex flex-1 items-center justify-center text-sm text-muted ${emptyMinHeight}`}>
          {emptyLabel}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-3 sm:flex-row sm:items-center">
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square shrink-0"
            style={{ width: chartSize, height: chartSize }}
            initialDimension={{ width: chartSize, height: chartSize }}
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    nameKey="label"
                    formatter={(value, _name, item) => {
                      const row = item.payload as InteractiveDonutSlice<K>;
                      return (
                        <span className="font-mono font-semibold text-foreground">
                          {formatMoney(Number(value))}
                          <span className="ml-1 text-muted-foreground">({row.percent}%)</span>
                        </span>
                      );
                    }}
                  />
                }
              />
              <Pie
                data={pieData}
                dataKey="amount"
                nameKey="label"
                innerRadius={compact ? 48 : 60}
                outerRadius={compact ? 68 : 88}
                paddingAngle={paddingAngle}
                strokeWidth={strokeWidth}
                stroke={strokeWidth > 0 ? stroke : undefined}
                onMouseEnter={(_, index) => {
                  const item = pieData[index];
                  if (item) setActiveKey(item.key);
                }}
              >
                {useCells
                  ? pieData.map((entry) => <Cell key={entry.key} fill={entry.fill} />)
                  : null}
                <Label
                  content={({ viewBox }) => {
                    if (!activeItem || !viewBox || !('cx' in viewBox) || !('cy' in viewBox)) {
                      return null;
                    }
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-sm font-bold"
                        >
                          {formatMoneyAmount(activeItem.amount)}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 16}
                          className={centerCaptionClassName}
                        >
                          {centerCaption
                            ? centerCaption(activeItem)
                            : `${activeItem.label} · ${activeItem.percent}%`}
                        </tspan>
                      </text>
                    );
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
            {slices.map((item) => (
              <button
                key={item.key}
                type="button"
                onMouseEnter={() => setActiveKey(item.key)}
                onFocus={() => setActiveKey(item.key)}
                className={`flex items-center gap-2 rounded-lg px-1 py-0.5 text-left text-xs transition-opacity ${
                  item.key === activeKey ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.fill }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-fg">{item.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-fg">
                  {formatMoney(item.amount)}
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums text-muted">
                  {item.percent}%
                </span>
              </button>
            ))}
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}
