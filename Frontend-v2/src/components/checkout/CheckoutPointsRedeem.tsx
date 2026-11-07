'use client';

import { Star } from 'lucide-react';
import { formatMoneyAmount } from '@/lib/receipt';

type CheckoutPointsRedeemProps = {
  availablePoints: number;
  maxPoints: number;
  usePoints: number;
  discountLkr: number;
  enabled: boolean;
  signedIn: boolean;
  earnPreview?: number;
  blockedReason?: string | null;
  onEnabledChange: (enabled: boolean) => void;
  onPointsChange: (points: number) => void;
};

export default function CheckoutPointsRedeem({
  availablePoints,
  maxPoints,
  usePoints,
  discountLkr,
  enabled,
  signedIn,
  earnPreview = 0,
  blockedReason = null,
  onEnabledChange,
  onPointsChange,
}: CheckoutPointsRedeemProps) {

  if (!signedIn) {
    return (
      <div className="mt-3 sm:mt-4 rounded-xl border border-brand/40 bg-brand-subtle p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
            <Star size={16} fill="currentColor" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">Redeem points</p>
            <p className="text-xs text-muted mt-0.5">
              Verify your phone to redeem loyalty points on this order.
              {earnPreview > 0 ? ` This order can earn about ${earnPreview.toLocaleString()} pts.` : ''}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (blockedReason) {
    return (
      <div className="mt-3 sm:mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
            <Star size={16} fill="currentColor" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">Redeem points</p>
            <p className="text-xs text-muted mt-0.5">{blockedReason}</p>
          </div>
        </div>
      </div>
    );
  }

  if (availablePoints <= 0 || maxPoints <= 0) {
    return (
      <div className="mt-3 sm:mt-4 rounded-xl border border-brand/40 bg-brand-subtle p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
            <Star size={16} fill="currentColor" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">Redeem points</p>
            <p className="text-xs text-muted mt-0.5">
              {availablePoints > 0
                ? `${availablePoints.toLocaleString()} pts available. Add a bit more to this order to redeem.`
                : earnPreview > 0
                  ? `You have 0 pts now. This order can earn about ${earnPreview.toLocaleString()} pts.`
                  : 'You have 0 pts. Earn points on this order and redeem next time.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 sm:mt-4 rounded-xl border border-brand/40 bg-brand-subtle p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
            <Star size={16} fill="currentColor" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">Redeem points</p>
            <p className="mt-0.5 text-xs text-muted">
              {availablePoints.toLocaleString()} pts available
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Redeem points"
          onClick={() => onEnabledChange(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center overflow-hidden rounded-full p-0.5 transition-colors ${
            enabled ? 'bg-brand' : 'bg-navy-border'
          }`}
        >
          <span
            className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="checkout-use-points" className="text-xs text-muted">
              Use points
            </label>
            <div className="flex items-center gap-2">
              <input
                id="checkout-use-points"
                type="number"
                min={0}
                max={maxPoints}
                value={usePoints}
                onChange={(e) => onPointsChange(Number(e.target.value) || 0)}
                className="w-20 rounded-lg border border-brand/40 bg-navy-card px-2 py-1 text-right text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-brand/35"
              />
              <button
                type="button"
                className="text-xs font-semibold text-brand hover:underline"
                onClick={() => onPointsChange(maxPoints)}
              >
                Max
              </button>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={maxPoints}
            value={usePoints}
            onChange={(e) => onPointsChange(Number(e.target.value) || 0)}
            className="w-full accent-brand"
            aria-label="Points to redeem"
          />
          <p className="text-xs font-medium text-brand">
            − {formatMoneyAmount(discountLkr)} off this order
          </p>
        </div>
      )}
    </div>
  );
}
