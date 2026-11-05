'use client';

import { useEffect, useMemo, useState } from 'react';
import { Label, Pie, PieChart, Sector } from 'recharts';
import type { PieSectorDataItem } from 'recharts/types/polar/Pie';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { DonutLegendSkeleton } from '@/components/admin/BranchDashboardSkeleton';

export type UserPlatformBreakdown = {
  webCount: number;
  appCount: number;
  total: number;
  webPercent: number;
  appPercent: number;
};

type ChartPoint = {
  platform: string;
  label: string;
  count: number;
  percent: number;
  fill: string;
};

const chartConfig = {
  users: {
    label: 'Users',
  },
  web: {
    label: 'Web Users',
    color: '#38bdf8',
  },
  app: {
    label: 'App Users',
    color: '#1d4ed8',
  },
} satisfies ChartConfig;

type Props = {
  data: UserPlatformBreakdown | null | undefined;
  periodLabel?: string;
  loading?: boolean;
  compact?: boolean;
};

export default function PlatformUsersPieChart({ data, periodLabel, loading, compact = false }: Props) {
  const [activeKey, setActiveKey] = useState<string>('web');

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    return [
      {
        platform: 'web',
        label: 'Web Users',
        count: data.webCount,
        percent: data.webPercent,
        fill: 'var(--color-web)',
      },
      {
        platform: 'app',
        label: 'App Users',
        count: data.appCount,
        percent: data.appPercent,
        fill: 'var(--color-app)',
      },
    ].filter((item) => item.count > 0);
  }, [data]);

  const activeIndex = useMemo(() => {
    const index = chartData.findIndex((item) => item.platform === activeKey);
    return index >= 0 ? index : 0;
  }, [activeKey, chartData]);

  useEffect(() => {
    if (chartData.length > 0 && !chartData.some((item) => item.platform === activeKey)) {
      setActiveKey(chartData[0].platform);
    }
  }, [activeKey, chartData]);

  const activeItem = chartData[activeIndex];
  const totalUsers = data?.total ?? 0;
  const chartSize = compact ? 168 : 250;

  return (
    <div className={`card flex h-full flex-col ${compact ? 'p-4' : 'p-5'}`}>
      <div className={compact ? 'mb-2' : 'mb-1'}>
        <h2 className="text-sm font-semibold text-fg">Users by Platform</h2>
        {periodLabel ? (
          <p className="mt-0.5 text-[11px] text-muted">{periodLabel} · registered users with paid orders</p>
        ) : null}
      </div>

      {loading ? (
        <DonutLegendSkeleton rows={2} minHeight={compact ? 180 : 220} />
      ) : chartData.length === 0 ? (
        <div className={`flex flex-1 items-center justify-center text-sm text-muted ${compact ? 'min-h-[180px]' : 'min-h-[220px]'}`}>
          No platform user data
        </div>
      ) : compact ? (
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
                    formatter={(value, _name, item) => (
                      <span className="font-mono font-semibold text-foreground">
                        {value} user{Number(value) !== 1 ? 's' : ''}
                        <span className="ml-1 text-muted-foreground">
                          ({(item.payload as ChartPoint).percent}%)
                        </span>
                      </span>
                    )}
                  />
                }
              />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="label"
                innerRadius={48}
                outerRadius={68}
                strokeWidth={5}
                stroke="var(--color-surface)"
                onMouseEnter={(_, index) => {
                  const item = chartData[index];
                  if (item) setActiveKey(item.platform);
                }}
              >
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
                          className="fill-foreground text-xl font-bold"
                        >
                          {activeItem.count.toLocaleString('en-LK')}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 18}
                          className="fill-muted-foreground text-[11px]"
                        >
                          {activeItem.label}
                        </tspan>
                      </text>
                    );
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
            {chartData.map((item) => (
              <button
                key={item.platform}
                type="button"
                onMouseEnter={() => setActiveKey(item.platform)}
                onFocus={() => setActiveKey(item.platform)}
                className={`flex items-center gap-2 rounded-lg px-1 py-0.5 text-left text-xs transition-opacity ${
                  item.platform === activeKey ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.fill }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-fg">{item.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-fg">
                  {item.count.toLocaleString('en-LK')}
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums text-muted">{item.percent}%</span>
              </button>
            ))}
            <p className="pt-1 text-[11px] text-muted">
              {totalUsers.toLocaleString('en-LK')} total platform users
            </p>
          </div>
        </div>
      ) : (
        <>
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square min-h-[220px] w-full max-h-[250px] flex-1"
            initialDimension={{ width: 400, height: 250 }}
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    nameKey="label"
                    formatter={(value, _name, item) => (
                      <span className="font-mono font-semibold text-foreground">
                        {value} user{Number(value) !== 1 ? 's' : ''}
                        <span className="ml-1 text-muted-foreground">
                          ({(item.payload as ChartPoint).percent}%)
                        </span>
                      </span>
                    )}
                  />
                }
              />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="label"
                innerRadius={60}
                outerRadius={88}
                strokeWidth={5}
                stroke="var(--color-surface)"
                shape={({ outerRadius = 0, payload, ...rest }: PieSectorDataItem) => {
                  const point = payload as ChartPoint | undefined;
                  const isHighlighted = point?.platform === activeKey;
                  const { key: sectorKey, ...props } = rest as typeof rest & { key?: string };
                  return (
                    <g key={sectorKey}>
                      <Sector
                        {...props}
                        outerRadius={isHighlighted ? outerRadius + 10 : outerRadius}
                      />
                      {isHighlighted ? (
                        <Sector
                          {...props}
                          outerRadius={outerRadius + 24}
                          innerRadius={outerRadius + 12}
                          fill="transparent"
                          stroke={props.fill}
                          strokeWidth={2}
                        />
                      ) : null}
                    </g>
                  );
                }}
                onMouseEnter={(_, index) => {
                  const item = chartData[index];
                  if (item) setActiveKey(item.platform);
                }}
              >
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
                          className="fill-foreground text-2xl font-bold"
                        >
                          {activeItem.count.toLocaleString('en-LK')}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 22}
                          className="fill-muted-foreground text-xs"
                        >
                          {activeItem.label}
                        </tspan>
                      </text>
                    );
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>

          <div className="mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-5">
            {chartData.map((item) => (
              <button
                key={item.platform}
                type="button"
                onMouseEnter={() => setActiveKey(item.platform)}
                onFocus={() => setActiveKey(item.platform)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs transition-opacity ${
                  item.platform === activeKey ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.fill }}
                  aria-hidden
                />
                <span className="text-fg">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted"> · {item.percent}%</span>
                </span>
              </button>
            ))}
          </div>

          <p className="mt-2 text-center text-[11px] text-muted">
            {totalUsers.toLocaleString('en-LK')} total platform users
          </p>
        </>
      )}
    </div>
  );
}
