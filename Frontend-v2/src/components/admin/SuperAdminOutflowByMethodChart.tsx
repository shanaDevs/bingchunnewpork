'use client';

import { TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';

import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import SuperAdminAnalyticsChartCard, {
  SUPER_ADMIN_CHART_CONTAINER_CLASS,
  SUPER_ADMIN_CHART_HEIGHT,
} from '@/components/admin/SuperAdminAnalyticsChartCard';
import { formatAxisAmount } from '@/components/admin/wallet-analysis/formatAxisAmount';
import type { WalletAnalysisFlowPoint } from '@/components/admin/wallet-analysis/walletAnalysisTypes';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney } from '@/lib/receipt';

const METHOD_AXIS_WIDTH = 118;
const OUTFLOW_COLOR = '#307ef2';

type Props = {
  data: WalletAnalysisFlowPoint[];
  periodLabel: string;
  loading?: boolean;
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
      style={{ fontSize: 10 }}
    >
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={(x ?? 0) - 4} dy={index === 0 ? 0 : 11}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export default function SuperAdminOutflowByMethodChart({ data, periodLabel, loading }: Props) {
  const total = data.reduce((sum, row) => sum + row.amount, 0);
  const chartConfig = {
    amount: { label: 'Amount', color: OUTFLOW_COLOR },
  } satisfies ChartConfig;

  return (
    <SuperAdminAnalyticsChartCard
      icon={<TrendingUp size={16} strokeWidth={2.25} aria-hidden />}
      iconClassName="bg-brand/10 text-brand"
      title="Outflows by method"
      subtitle={`${periodLabel} · outgoing from wallet`}
      headerRight={
        loading ? (
          <DashSkel className="h-5 w-28" />
        ) : data.length > 0 ? (
          <span className="shrink-0 text-sm font-bold tabular-nums text-brand sm:text-base">
            {formatMoney(total)}
          </span>
        ) : null
      }
      loading={loading}
      empty={data.length === 0}
      emptyLabel="No outflows in this period"
      skeletonRows={4}
      skeletonLabelWidthClass="w-20"
      skeletonBarStartPercent={70}
    >
      <ChartContainer
        config={chartConfig}
        className={SUPER_ADMIN_CHART_CONTAINER_CLASS}
        style={{ height: SUPER_ADMIN_CHART_HEIGHT }}
        initialDimension={{ width: 420, height: SUPER_ADMIN_CHART_HEIGHT }}
      >
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 48, left: 2, bottom: 4 }}
          barCategoryGap="28%"
        >
          <CartesianGrid
            horizontal={false}
            vertical
            strokeDasharray="4 6"
            className="stroke-slate-200/80"
          />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            height={22}
            tickFormatter={formatAxisAmount}
            className="text-[10px] text-muted"
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
            cursor={{ fill: 'rgba(148,163,184,0.10)' }}
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
            radius={[0, 999, 999, 0]}
            maxBarSize={16}
          >
            <LabelList
              dataKey="amount"
              position="right"
              offset={8}
              formatter={(value) => formatAxisAmount(Number(value ?? 0))}
              style={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </SuperAdminAnalyticsChartCard>
  );
}
