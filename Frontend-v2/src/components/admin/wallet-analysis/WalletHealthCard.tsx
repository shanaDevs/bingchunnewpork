'use client';

import { Cell, Pie, PieChart } from 'recharts';

import AnalysisCard from '@/components/admin/wallet-analysis/AnalysisCard';
import type { WalletAnalysisHealthSlice } from '@/components/admin/wallet-analysis/walletAnalysisTypes';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney } from '@/lib/receipt';

/** Sales dual palette: brand blue + emerald (BrandSalesOverviewChart). */
const SLICE_COLORS: Record<string, string> = {
  inflow: '#77BEF0',
  outflow: '#EA5B6F',
};

const chartConfig = {
  inflow: { label: 'Inflow', color: '#77BEF0' },
  outflow: { label: 'Outflow', color: '#EA5B6F' },
} satisfies ChartConfig;

type Props = {
  percent: number;
  slices: WalletAnalysisHealthSlice[];
};

export default function WalletHealthCard({ percent, slices }: Props) {
  const safePercent = Math.min(100, Math.max(0, Math.round(percent)));
  const chartData = slices
    .filter((s) => s.amount > 0)
    .map((s) => ({
      key: s.key,
      label: s.label,
      amount: s.amount,
      fill: SLICE_COLORS[s.key] ?? '#64748b',
    }));

  const total = chartData.reduce((sum, s) => sum + s.amount, 0);

  return (
    <AnalysisCard
      title="Wallet health"
      subtitle="Period retention · inflow vs outflow"
      headerRight={
        <div className="text-right">
          <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Health
          </p>
          <p className="text-xl font-bold tabular-nums text-[var(--color-text)]">{safePercent}%</p>
        </div>
      }
    >
      <div className="relative mx-auto flex flex-1 flex-col items-center justify-center gap-3">
        {total <= 0 ? (
          <div className="flex h-[180px] w-full items-center justify-center text-sm text-[var(--color-text-muted)]">
            No flow this month
          </div>
        ) : (
          <div className="relative mx-auto aspect-square h-[180px] w-full max-w-[180px]">
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-square h-[180px] w-full"
              initialDimension={{ width: 180, height: 180 }}
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      nameKey="key"
                      formatter={(value, name) => {
                        const label =
                          chartConfig[name as keyof typeof chartConfig]?.label ?? name;
                        return (
                          <div className="flex w-full flex-col items-end gap-0.5">
                            <span className="font-medium text-foreground">{label}</span>
                            <span className="font-mono font-semibold text-foreground">
                              {formatMoney(Number(value))}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Pie
                  data={chartData}
                  dataKey="amount"
                  nameKey="key"
                  cx="50%"
                  cy="50%"
                  outerRadius={78}
                  strokeWidth={2}
                  stroke="var(--color-navy-card, #1e293b)"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>
        )}

        {chartData.length > 0 && (
          <ul className="flex w-full max-w-[200px] flex-col gap-1.5">
            {chartData.map((item) => (
              <li
                key={item.key}
                className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-text-muted)]"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  {item.label}
                </span>
                <span className="font-medium tabular-nums text-[var(--color-text)]">
                  {formatMoney(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AnalysisCard>
  );
}
