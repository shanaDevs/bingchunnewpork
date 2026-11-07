'use client';

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';

import AnalysisCard from '@/components/admin/wallet-analysis/AnalysisCard';
import { formatAxisAmount } from '@/components/admin/wallet-analysis/formatAxisAmount';
import type { WalletAnalysisFlowPoint } from '@/components/admin/wallet-analysis/walletAnalysisTypes';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney } from '@/lib/receipt';

const DEFAULT_IN_COLORS = ['#307ef2'] as const;
const DEFAULT_OUT_COLORS = ['#307ef2'] as const;

const CHART_HEIGHT = 168;
const METHOD_AXIS_WIDTH = 112;

type Props = {
  title: string;
  subtitle: string;
  data: WalletAnalysisFlowPoint[];
  colors?: readonly string[];
};

function MethodAxisTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const raw = String(payload?.value ?? '');
  const words = raw.split(/\s+/).filter(Boolean);
  const lines =
    words.length <= 2 || raw.length <= 16
      ? [raw]
      : [
          words.slice(0, Math.ceil(words.length / 2)).join(' '),
          words.slice(Math.ceil(words.length / 2)).join(' '),
        ];

  return (
    <text
      x={(x ?? 0) - 4}
      y={y ?? 0}
      textAnchor="end"
      dominantBaseline="middle"
      fill="var(--color-text-muted)"
      style={{ fontSize: 9 }}
    >
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={(x ?? 0) - 4} dy={index === 0 ? 0 : 10}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export default function WalletFlowBreakdownChart({
  title,
  subtitle,
  data,
  colors = DEFAULT_IN_COLORS,
}: Props) {
  const fillColor = colors[0] ?? '#307ef2';
  const flowChartConfig = {
    amount: { label: 'Amount', color: fillColor },
  } satisfies ChartConfig;

  return (
    <AnalysisCard title={title} subtitle={subtitle}>
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted">
          No amounts this month
        </div>
      ) : (
        <ChartContainer
          config={flowChartConfig}
          className="aspect-auto h-full w-full overflow-visible [&>.recharts-responsive-container]:h-full [&>.recharts-responsive-container]:min-h-0 [&>.recharts-responsive-container]:w-full"
          style={{ height: CHART_HEIGHT }}
          initialDimension={{ width: 420, height: CHART_HEIGHT }}
        >
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 44, left: 2, bottom: 2 }}
            barCategoryGap="32%"
          >
            <CartesianGrid
              horizontal={false}
              vertical
              strokeDasharray="3 3"
              className="stroke-border/40"
            />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              height={20}
              tickFormatter={formatAxisAmount}
              className="text-[10px]"
              domain={[0, (dataMax: number) => Math.max(dataMax * 1.2, 1)]}
            />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              width={METHOD_AXIS_WIDTH}
              tickMargin={6}
              interval={0}
              tick={<MethodAxisTick />}
            />
            <ChartTooltip
              cursor={{ fill: 'rgba(148,163,184,0.12)' }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const method = payload?.[0]?.payload?.label;
                    return typeof method === 'string' ? method : '';
                  }}
                  formatter={(value) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-mono font-semibold tabular-nums text-foreground">
                        {formatMoney(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Bar
              dataKey="amount"
              fill="var(--color-amount, #307ef2)"
              radius={[0, 4, 4, 0]}
              maxBarSize={12}
            >
              <LabelList
                dataKey="amount"
                position="right"
                offset={6}
                formatter={(value) => formatAxisAmount(Number(value ?? 0))}
                style={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </AnalysisCard>
  );
}

export { DEFAULT_IN_COLORS, DEFAULT_OUT_COLORS };
