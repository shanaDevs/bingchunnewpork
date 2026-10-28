'use client';

import { useMemo } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { DELIVERY_JOB_STATUS_LABEL } from '@/lib/adminBadges';
import { ChartBarsSkeleton } from '@/components/admin/BranchDashboardSkeleton';

export type DailyTrendPoint = {
  date: string;
  completedJobs: number;
  distinctOrders: number;
  totalDistanceKm: number;
};

const trendConfig = {
  completedJobs: { label: 'Completed jobs', color: '#307ef2' },
  totalDistanceKm: { label: 'Distance (km)', color: '#10b981' },
} satisfies ChartConfig;

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: '#64748b',
  ASSIGNED: '#eab308',
  QUEUED: '#a855f7',
  IN_PROGRESS: '#f97316',
  RETURNING: '#0ea5e9',
  COMPLETED: '#10b981',
  CANCELLED: '#ef4444',
  VEHICLE_FAILURE: '#dc2626',
};

function shortDay(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString('en-LK', { month: 'short', day: 'numeric' });
}

export function DeliveryTrendChart({
  data,
  loading,
}: {
  data: DailyTrendPoint[];
  loading?: boolean;
}) {
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        label: shortDay(point.date),
      })),
    [data],
  );
  const hasJobs = chartData.some((point) => point.completedJobs > 0);

  if (loading) return <ChartBarsSkeleton minHeight={220} />;
  if (!hasJobs) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted">
        No completed jobs in this period
      </div>
    );
  }

  return (
    <ChartContainer
      config={trendConfig}
      className="aspect-auto h-[220px] w-full"
      initialDimension={{ width: 640, height: 220 }}
    >
      <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis yAxisId="jobs" allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <YAxis
          yAxisId="km"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={32}
          tickFormatter={(value) => `${value}`}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          yAxisId="jobs"
          dataKey="completedJobs"
          fill="var(--color-completedJobs)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Line
          yAxisId="km"
          type="monotone"
          dataKey="totalDistanceKm"
          stroke="var(--color-totalDistanceKm)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

export function DeliveryStatusChart({
  counts,
  loading,
}: {
  counts: Record<string, number>;
  loading?: boolean;
}) {
  const slices = useMemo(
    () =>
      Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
          status,
          name: DELIVERY_JOB_STATUS_LABEL[status] ?? status,
          count,
          fill: STATUS_COLOR[status] ?? '#94a3b8',
        })),
    [counts],
  );
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const config = useMemo(() => {
    const next: ChartConfig = {};
    for (const slice of slices) {
      next[slice.status] = { label: slice.name, color: slice.fill };
    }
    return next;
  }, [slices]);

  if (loading) return <ChartBarsSkeleton minHeight={220} />;
  if (total === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted">
        No jobs in this period
      </div>
    );
  }

  return (
    <div className="grid h-[220px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
      <ChartContainer config={config} className="aspect-auto h-[200px] w-full" initialDimension={{ width: 200, height: 200 }}>
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
          <Pie data={slices} dataKey="count" nameKey="status" innerRadius={48} outerRadius={78} strokeWidth={2}>
            {slices.map((slice) => (
              <Cell key={slice.status} fill={slice.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="max-h-[200px] space-y-1.5 overflow-auto pr-1 text-xs">
        {slices.map((slice) => (
          <li key={slice.status} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-muted">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: slice.fill }} />
              <span className="truncate">{slice.name}</span>
            </span>
            <span className="tabular-nums font-medium text-fg">{slice.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
