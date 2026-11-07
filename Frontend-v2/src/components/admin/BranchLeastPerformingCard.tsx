'use client';

import { AlertTriangle, TrendingDown } from 'lucide-react';

import { formatMoneyAmount } from '@/lib/receipt';
import { shortBranchName } from '@/lib/branchName';

export type LeastPerformingBranch = {
  rank: number;
  storeId: string;
  branchName: string;
  totalOrders: number;
  grossSales: number;
  commission: number;
  netTakeHome: number;
  percentBelowAverage: number;
  webOrders?: number;
  mobileOrders?: number;
  newCustomers?: number;
  loyalCustomers?: number;
};

type Props = {
  branches: LeastPerformingBranch[];
  periodLabel: string;
  loading?: boolean;
};

export default function BranchLeastPerformingCard({ branches, periodLabel, loading }: Props) {
  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/5 text-sm text-muted">
        Loading least performing branches…
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/5 text-sm text-muted">
        No branch sales data in this period
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border shadow-sm"
      style={{
        borderColor: 'rgba(245,158,11,0.35)',
        background:
          'linear-gradient(145deg, rgba(245,158,11,0.08) 0%, rgba(255,255,255,0.02) 100%)',
      }}
    >
      <div className="border-b border-amber-500/20 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          <h2 className="text-sm font-semibold text-fg">Least Performing Branches</h2>
          <span className="text-muted">·</span>
          <span className="text-xs text-muted">{periodLabel}</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Bottom branches by gross sales — compared to brand average
        </p>
      </div>

      <div className="overflow-x-auto p-5">
        <table className="least-performing-branches-table w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-navy-border text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-semibold">Rank</th>
              <th className="px-3 py-2 font-semibold">Branch Name</th>
              <th className="px-3 py-2 text-right font-semibold">Orders</th>
              <th className="px-3 py-2 text-right font-semibold">Web</th>
              <th className="px-3 py-2 text-right font-semibold">Mobile</th>
              <th className="px-3 py-2 text-right font-semibold">New Customers</th>
              <th className="px-3 py-2 text-right font-semibold">Loyal Customers</th>
              <th className="px-3 py-2 text-right font-semibold">Gross Sales (LKR)</th>
              <th className="px-3 py-2 text-right font-semibold">vs Avg</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => {
              const isLowest = branch.rank === 1;
              return (
                <tr
                  key={branch.storeId}
                  className={`border-b border-navy-border/60 last:border-0 ${
                    isLowest ? 'bg-red-500/5' : ''
                  }`}
                >
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                        isLowest
                          ? 'bg-red-500/15 text-red-500'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      #{branch.rank}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-medium text-fg">
                    {shortBranchName(branch.branchName)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-fg">
                    {branch.totalOrders}
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-brand">
                    {branch.webOrders ?? 0}
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-orange-500">
                    {branch.mobileOrders ?? 0}
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-indigo-400">
                    {branch.newCustomers ?? 0}
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-pink-500">
                    {branch.loyalCustomers ?? 0}
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-fg">
                    {formatMoneyAmount(branch.grossSales)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                        isLowest
                          ? 'bg-red-500/15 text-red-500'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      <TrendingDown size={12} />
                      {branch.percentBelowAverage}% below avg
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
