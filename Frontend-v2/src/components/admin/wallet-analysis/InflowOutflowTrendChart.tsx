'use client';

import type { ReactNode } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import AnalysisCard from '@/components/admin/wallet-analysis/AnalysisCard';
import { formatAxisAmount } from '@/components/admin/wallet-analysis/formatAxisAmount';
import type { WalletAnalysisTrendPoint } from '@/components/admin/wallet-analysis/walletAnalysisTypes';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney } from '@/lib/receipt';

const chartConfig = {
  inflow: { label: 'Inflow', color: '#307ef2' },
  outflow: { label: 'Outflow', color: '#ef4444' },
} satisfies ChartConfig;

type Props = {
  data: WalletAnalysisTrendPoint[];
  headerRight?: ReactNode;
};

export default function InflowOutflowTrendChart({ data, headerRight }: Props) {
  return (
    <AnalysisCard
      title="Inflow vs Outflow Trend"
      subtitle="Daily amounts (LKR) for the selected month"
      minHeightClassName="min-h-[220px] lg:min-h-0"
      headerRight={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <span className="h-2 w-2 rounded-full bg-[#307ef2]" aria-hidden />
            Inflow
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <span className="h-2 w-2 rounded-full bg-[#ef4444]" aria-hidden />
            Outflow
          </span>
          {headerRight}
        </div>
      }
    >
      <ChartContainer
        config={chartConfig}
        className="!aspect-auto h-full w-full justify-stretch [&_.recharts-responsive-container]:!h-full [&_.recharts-responsive-container]:!w-full"
        style={{ height: 180 }}
        initialDimension={{ width: 720, height: 180 }}
      >
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="fillWalletInflow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-inflow)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-inflow)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fillWalletOutflow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-outflow)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-outflow)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              height={22}
              minTickGap={8}
              className="text-[10px]"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              width={36}
              tickFormatter={formatAxisAmount}
              className="text-[10px]"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    const label =
                      chartConfig[name as keyof typeof chartConfig]?.label ?? name;
                    return (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono font-semibold tabular-nums text-foreground">
                          {formatMoney(Number(value))}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="inflow"
              stroke="var(--color-inflow)"
              strokeWidth={2}
              fill="url(#fillWalletInflow)"
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Area
              type="monotone"
              dataKey="outflow"
              stroke="var(--color-outflow)"
              strokeWidth={2}
              fill="url(#fillWalletOutflow)"
              dot={false}
              activeDot={{ r: 3 }}
            />
          </AreaChart>
        </ChartContainer>
    </AnalysisCard>
  );
}
