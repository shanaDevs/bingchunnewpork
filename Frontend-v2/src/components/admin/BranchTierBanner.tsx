'use client';

import { Truck, ShoppingBag } from 'lucide-react';
import { formatMoney } from '@/lib/receipt';

export type TierSummary = {
  topTier: {
    branchCount: number;
    avgSalesPerBranch: number;
  };
  standardTier: {
    branchCount: number;
    avgSalesPerBranch: number;
  };
};

type Props = {
  summary?: TierSummary;
  loading?: boolean;
};

export default function BranchTierBanner({ summary, loading }: Props) {
  if (loading || !summary) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((key) => (
          <div key={key} className="card h-24 animate-pulse bg-navy-light/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card overflow-hidden border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-indigo-600/5">
        <div className="border-b border-indigo-500/20 px-5 py-4">
          <div className="flex items-center gap-2">
            <Truck size={16} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-fg">Delivery & Pickup Branches</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5">
          <div>
            <p className="text-xs text-muted">Branches active</p>
            <p className="text-2xl font-bold text-fg">{summary.topTier.branchCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Avg sales / branch</p>
            <p className="text-lg font-bold text-fg">{formatMoney(summary.topTier.avgSalesPerBranch)}</p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-600/5">
        <div className="border-b border-amber-500/20 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag size={16} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-fg">Pickup Only Branches</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5">
          <div>
            <p className="text-xs text-muted">Branches active</p>
            <p className="text-2xl font-bold text-fg">{summary.standardTier.branchCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Avg sales / branch</p>
            <p className="text-lg font-bold text-fg">
              {formatMoney(summary.standardTier.avgSalesPerBranch)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
