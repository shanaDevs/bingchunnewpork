'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import RankMedalBadge from '@/components/admin/RankMedalBadge';
import { shortBranchName } from '@/lib/branchName';
import { formatMoney } from '@/lib/receipt';

export const TOP_TIER_SCORECARD_PAGE_SIZE = 10;

export function ScorecardPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="btn-outline flex h-8 w-8 items-center justify-center p-0"
        disabled={page <= 0}
        onClick={() => onPageChange(Math.max(0, page - 1))}
        aria-label="Previous scorecard page"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        className="btn-outline flex h-8 w-8 items-center justify-center p-0"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
        aria-label="Next scorecard page"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export type TopTierScorecard = {
  rank: number;
  storeId: string;
  branchName: string;
  totalOrders: number;
  grossSales: number;
  deliveryPercent: number;
  netTakeHome: number;
  pickupOrders?: number;
  pickupAmount?: number;
  deliveryOrders?: number;
  deliveryAmount?: number;
};

type Props = {
  cards: TopTierScorecard[];
  loading?: boolean;
};

export default function TopTierScorecardGrid({ cards, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="card h-44 animate-pulse bg-navy-light/30" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="card flex min-h-[120px] items-center justify-center text-sm text-muted">
        No delivery & pickup branches configured
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => {
        const pickupOrders = card.pickupOrders ?? 0;
        const pickupAmount = card.pickupAmount ?? 0;
        const deliveryOrders = card.deliveryOrders ?? Math.max(0, card.totalOrders - pickupOrders);
        const deliveryAmount = card.deliveryAmount ?? Math.max(0, card.grossSales - pickupAmount);

        return (
          <div
            key={card.storeId}
            className={`card relative p-4 ${card.rank <= 3 ? 'pt-12' : ''} ${
              card.rank === 1
                ? 'border-amber-400/40 bg-gradient-to-br from-amber-500/10 to-yellow-500/5'
                : card.rank === 2
                  ? 'border-slate-400/30 bg-gradient-to-br from-slate-400/10 to-slate-500/5'
                  : card.rank === 3
                    ? 'border-orange-400/30 bg-gradient-to-br from-orange-500/10 to-amber-600/5'
                    : 'border-indigo-500/20 bg-indigo-500/5'
            }`}
          >
            {card.rank <= 3 ? (
              <RankMedalBadge
                rank={card.rank}
                className="absolute -left-4 -top-4 drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)]"
              />
            ) : (
              <div className="mb-2">
                <RankMedalBadge rank={card.rank} />
              </div>
            )}

            <div className="text-center">
              <p className="truncate text-sm font-semibold text-fg">
                {shortBranchName(card.branchName)}
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums text-brand">
                {formatMoney(card.grossSales)}
              </p>
            </div>

            <div className="mt-3 grid grid-cols-2 divide-x divide-navy-border/60 overflow-hidden rounded-lg border border-navy-border/60">
              <div className="px-2 py-2.5 text-center">
                <p className="text-[10px] font-medium text-muted">
                  Delivery ({deliveryOrders})
                </p>
                <p className="mt-1 text-xs font-bold tabular-nums text-fg">
                  {formatMoney(deliveryAmount)}
                </p>
              </div>
              <div className="px-2 py-2.5 text-center">
                <p className="text-[10px] font-medium text-muted">
                  Pickup ({pickupOrders})
                </p>
                <p className="mt-1 text-xs font-bold tabular-nums text-fg">
                  {formatMoney(pickupAmount)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
