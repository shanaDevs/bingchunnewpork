'use client';

import { useMemo } from 'react';
import { Cell, Pie, PieChart } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export type CustomerGrowthSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export type CustomerGrowthData = {
  segments: CustomerGrowthSegment[];
  total: number;
};

type Props = {
  data: CustomerGrowthData | null | undefined;
  periodLabel: string;
  loading?: boolean;
};

const chartConfig = {
  newRegistered: { label: 'New Registered', color: '#307ef2' },
  returningLoyal: { label: 'Returning Customers', color: '#a78bfa' },
} satisfies ChartConfig;

export default function CustomerGrowthCard({ data, periodLabel, loading }: Props) {
  const segments = data?.segments ?? [];
  const total = data?.total ?? 0;

  const chartData = useMemo(
    () =>
      segments
        .filter((s) => s.value > 0)
        .map((s) => ({
          ...s,
          fill: s.color,
        })),
    [segments],
  );

  const hasData = total > 0;

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="border-b border-navy-border px-5 py-4">
        <h2 className="text-sm font-semibold text-fg">Customer Growth</h2>
        <p className="mt-0.5 text-xs text-muted">{periodLabel} · unique paying customers</p>
      </div>

      <div className="flex flex-1 flex-col px-5 py-4">
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {segments.map((segment) => (
                <div key={segment.key} className="flex min-w-0 items-start gap-2.5">
                  <span
                    className="mt-1 h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />
                  <div className="min-w-0">
                    <p className="text-lg font-bold tabular-nums leading-none text-fg sm:text-xl">
                      {segment.value.toLocaleString('en-LK')}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-muted">{segment.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative mx-auto mt-2 w-full max-w-[320px] flex-1">
              {!hasData ? (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted">
                  No paying customers in this period
                </div>
              ) : (
                <>
                  <ChartContainer
                    config={chartConfig}
                    className="mx-auto aspect-[2/1] h-[200px] w-full max-w-[320px] [&_.recharts-responsive-container]:!h-full"
                    initialDimension={{ width: 320, height: 200 }}
                  >
                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            hideLabel
                            nameKey="label"
                            formatter={(value) => (
                              <span className="font-mono font-semibold text-foreground">
                                {value} customer{Number(value) !== 1 ? 's' : ''}
                                {total > 0 && (
                                  <span className="ml-1 text-muted-foreground">
                                    ({Math.round((Number(value) / total) * 100)}%)
                                  </span>
                                )}
                              </span>
                            )}
                          />
                        }
                      />
                      <Pie
                        data={chartData.length > 0 ? chartData : [{ key: 'empty', label: '', value: 1, fill: 'transparent' }]}
                        dataKey="value"
                        nameKey="label"
                        cx="50%"
                        cy="100%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius="62%"
                        outerRadius="100%"
                        paddingAngle={3}
                        cornerRadius={6}
                        strokeWidth={0}
                      >
                        {chartData.map((entry) => (
                          <Cell key={entry.key} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>

                  <div className="pointer-events-none absolute inset-x-0 bottom-2 flex flex-col items-center justify-end text-center">
                    <p className="text-2xl font-bold tabular-nums tracking-tight text-fg">
                      {total.toLocaleString('en-LK')}
                    </p>
                    <p className="text-[11px] text-muted">Total Customers</p>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
