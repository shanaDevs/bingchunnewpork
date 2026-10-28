'use client';

import { useMemo } from 'react';
import { Cell, Pie, PieChart } from 'recharts';

import DonutChartCenterLabel from '@/components/admin/DonutChartCenterLabel';
import { DonutLegendSkeleton } from '@/components/admin/BranchDashboardSkeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { type RevenueChannels } from '@/components/admin/BranchRevenueBreakdownDonut';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';

type Props = {
  revenueChannels?: RevenueChannels;
  deliveryRevenue?: number;
  periodLabel: string;
  loading?: boolean;
};

const CHART_SIZE = 168;

const chartConfig = {
  deliveryOnline: { label: 'Delivery Online', color: '#1e3a8a' },
  online: { label: 'Online', color: '#307ef2' },
  cash: { label: 'Cash', color: '#38bdf8' },
  card: { label: 'Card', color: '#93c5fd' },
} satisfies ChartConfig;

function pct(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export default function SuperAdminPaymentBreakdownCard({
  revenueChannels,
  deliveryRevenue = 0,
  periodLabel,
  loading,
}: Props) {
  const cash = revenueChannels?.pickupCash ?? 0;
  const card = revenueChannels?.pickupCard ?? 0;
  const online = revenueChannels?.pickupOnline ?? 0;
  const deliveryOnline = deliveryRevenue;
  const total = cash + card + online + deliveryOnline;

  const rows = useMemo(
    () =>
      [
        { key: 'deliveryOnline', label: 'Delivery Online', amount: deliveryOnline, color: '#1e3a8a' },
        { key: 'online', label: 'Online', amount: online, color: '#307ef2' },
        { key: 'cash', label: 'Cash', amount: cash, color: '#38bdf8' },
        { key: 'card', label: 'Card', amount: card, color: '#93c5fd' },
      ].map((row) => ({ ...row, percent: pct(row.amount, total) })),
    [cash, card, online, deliveryOnline, total],
  );

  const pieData = rows.filter((row) => row.amount > 0);

  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">Payment Breakdown</h2>
          <p className="mt-0.5 text-[11px] text-muted">{periodLabel} · paid orders</p>
        </div>
        <span className="rounded-full bg-navy-light px-2 py-0.5 text-[10px] font-semibold text-muted">
          {periodLabel}
        </span>
      </div>

      {loading ? (
        <DonutLegendSkeleton rows={4} />
      ) : total <= 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted">No payment data</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center">
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
                        {formatMoney(Number(value))} · {(item.payload as (typeof rows)[number]).percent}%
                      </span>
                    )}
                  />
                }
              />
              <Pie
                data={pieData}
                dataKey="amount"
                nameKey="label"
                innerRadius={48}
                outerRadius={68}
                paddingAngle={pieData.length > 1 ? 3 : 0}
                strokeWidth={0}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
                <DonutChartCenterLabel value={formatMoneyAmount(total)} label="Total payments" />
              </Pie>
            </PieChart>
          </ChartContainer>

          <ul className="flex w-full min-w-0 flex-1 flex-col gap-2">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-fg">{row.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-fg">
                  LKR {formatMoneyAmount(row.amount)}
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums text-muted">{row.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
