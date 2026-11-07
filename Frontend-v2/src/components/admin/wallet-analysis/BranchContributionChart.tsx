'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';

import AnalysisCard from '@/components/admin/wallet-analysis/AnalysisCard';
import { formatAxisAmount } from '@/components/admin/wallet-analysis/formatAxisAmount';
import type { WalletAnalysisBranchContribution } from '@/components/admin/wallet-analysis/walletAnalysisTypes';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney } from '@/lib/receipt';

const chartConfig = {
  amount: { label: 'Contribution', color: '#307ef2' },
} satisfies ChartConfig;

const TOP_BRANCHES = 8;
const CHART_HEIGHT = 168;

type Props = {
  data: WalletAnalysisBranchContribution[];
};

function BranchAxisTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const raw = String(payload?.value ?? '');
  const label = raw.length > 9 ? `${raw.slice(0, 8)}…` : raw;
  return (
    <text
      x={x}
      y={y}
      dy={8}
      textAnchor="middle"
      fill="var(--color-text-muted)"
      style={{ fontSize: 9 }}
    >
      <title>{raw}</title>
      {label}
    </text>
  );
}

export default function BranchContributionChart({ data }: Props) {
  const chartData = useMemo(
    () =>
      [...data]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, TOP_BRANCHES),
    [data],
  );

  return (
    <AnalysisCard
      title="Branch Contribution"
      subtitle="How much each branch adds to the wallet"
    >
      {chartData.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted">
          No branch credits this month
        </div>
      ) : (
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-full w-full [&>.recharts-responsive-container]:h-full [&>.recharts-responsive-container]:min-h-0 [&>.recharts-responsive-container]:w-full"
          style={{ height: CHART_HEIGHT }}
          initialDimension={{ width: 420, height: CHART_HEIGHT }}
        >
          <BarChart data={chartData} margin={{ top: 16, right: 4, left: 0, bottom: 2 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              height={28}
              interval={0}
              tick={<BranchAxisTick />}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              width={32}
              tickFormatter={formatAxisAmount}
              className="text-[10px]"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => {
                    const percent = (item?.payload as { percent?: number } | undefined)?.percent;
                    return (
                      <div className="flex w-full flex-col items-end gap-0.5">
                        <span className="font-mono font-semibold tabular-nums text-foreground">
                          {formatMoney(Number(value))}
                        </span>
                        {typeof percent === 'number' && (
                          <span className="text-muted-foreground">{percent}% of total</span>
                        )}
                      </div>
                    );
                  }}
                />
              }
            />
            <Bar
              dataKey="amount"
              fill="var(--color-amount, #307ef2)"
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            >
              <LabelList
                dataKey="percent"
                position="top"
                offset={4}
                formatter={(value) => `${Number(value ?? 0)}%`}
                style={{ fill: '#94a3b8', fontSize: 9, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </AnalysisCard>
  );
}
