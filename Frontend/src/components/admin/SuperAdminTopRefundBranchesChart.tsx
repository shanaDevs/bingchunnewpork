'use client';

import { RotateCcw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';

import SuperAdminAnalyticsChartCard, {
  SUPER_ADMIN_CHART_CONTAINER_CLASS,
  SUPER_ADMIN_CHART_HEIGHT,
} from '@/components/admin/SuperAdminAnalyticsChartCard';
import { formatAxisAmount } from '@/components/admin/wallet-analysis/formatAxisAmount';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { shortBranchName } from '@/lib/branchName';
import { formatMoney } from '@/lib/receipt';

export type SuperAdminTopRefundBranch = {
  storeId: string;
  branchName: string;
  amount: number;
  count: number;
};

const BRANCH_AXIS_WIDTH = 96;
const REFUND_COLOR = '#112E81';

type Props = {
  data: SuperAdminTopRefundBranch[];
  periodLabel: string;
  loading?: boolean;
};

function formatBarAmount(amount: number): string {
  return `LKR ${Math.round(amount).toLocaleString('en-LK')}`;
}

function BranchAxisTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const raw = shortBranchName(String(payload?.value ?? ''));
  const label = raw.length > 14 ? `${raw.slice(0, 13)}…` : raw;

  return (
    <text
      x={(x ?? 0) - 4}
      y={y ?? 0}
      textAnchor="end"
      dominantBaseline="middle"
      fill="var(--color-text-muted)"
      style={{ fontSize: 10 }}
    >
      {label}
    </text>
  );
}

export default function SuperAdminTopRefundBranchesChart({ data, periodLabel, loading }: Props) {
  const chartData = data.map((row) => ({
    ...row,
    label: shortBranchName(row.branchName),
  }));
  const chartConfig = {
    amount: { label: 'Refund amount', color: REFUND_COLOR },
  } satisfies ChartConfig;

  return (
    <SuperAdminAnalyticsChartCard
      icon={<RotateCcw size={16} strokeWidth={2.25} aria-hidden />}
      iconClassName="bg-rose-50 text-rose-500"
      title="Top refund branches"
      subtitle={`${periodLabel} · highest refund amounts`}
      loading={loading}
      empty={chartData.length === 0}
      emptyLabel="No refunds in this period"
      skeletonRows={5}
      skeletonLabelWidthClass="w-16"
      skeletonBarStartPercent={75}
    >
      <ChartContainer
        config={chartConfig}
        className={SUPER_ADMIN_CHART_CONTAINER_CLASS}
        style={{ height: SUPER_ADMIN_CHART_HEIGHT }}
        initialDimension={{ width: 360, height: SUPER_ADMIN_CHART_HEIGHT }}
      >
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 78, left: 2, bottom: 4 }}
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
            domain={[0, (dataMax: number) => Math.max(dataMax * 1.22, 1)]}
          />
          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            width={BRANCH_AXIS_WIDTH}
            tickMargin={6}
            interval={0}
            tick={<BranchAxisTick />}
          />
          <ChartTooltip
            cursor={{ fill: 'rgba(148,163,184,0.10)' }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const branch = payload?.[0]?.payload?.label;
                  return typeof branch === 'string' ? branch : '';
                }}
                formatter={(value, _name, item) => {
                  const count = Number(item?.payload?.count ?? 0);
                  return (
                    <div className="flex w-full flex-col gap-1">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Refund amount</span>
                        <span className="font-mono font-semibold tabular-nums text-foreground">
                          {formatMoney(Number(value))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Refunds</span>
                        <span className="font-mono font-semibold tabular-nums text-foreground">
                          {count}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
            }
          />
          <Bar
            dataKey="amount"
            fill="var(--color-amount, #112E81)"
            radius={[0, 999, 999, 0]}
            maxBarSize={16}
          >
            <LabelList
              dataKey="amount"
              position="right"
              offset={8}
              formatter={(value) => formatBarAmount(Number(value ?? 0))}
              style={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </SuperAdminAnalyticsChartCard>
  );
}
