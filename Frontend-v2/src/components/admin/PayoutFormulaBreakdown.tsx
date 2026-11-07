'use client';

import { Info } from 'lucide-react';
import { formatMoney } from '@/lib/receipt';
import { type PayoutFormulaBreakdownLkr } from '@/components/admin/settlementTypes';

export type { PayoutFormulaBreakdownLkr };
export { sumAllRevenueSubtotal as sumPeriodRevenueSubtotal } from '@/components/admin/settlementTypes';

type Props = {
  breakdownLkr: PayoutFormulaBreakdownLkr | null;
  orderSubtotalLkr: number | null;
  convenienceFeeLkr?: number;
  slabRatePct?: number | null;
  gatewayRatePct?: number;
  className?: string;
  footnote?: string;
};

export default function PayoutFormulaBreakdown({
  breakdownLkr,
  orderSubtotalLkr,
  convenienceFeeLkr = 0,
  slabRatePct = null,
  gatewayRatePct = 1.9,
  className = 'mb-5',
  footnote,
}: Props) {
  const showValues =
    breakdownLkr != null &&
    breakdownLkr.orderCount > 0 &&
    orderSubtotalLkr != null;

  return (
    <div
      className={`flex gap-3 rounded-xl border border-[var(--color-navy-border)]/80 bg-[var(--color-input-bg)]/25 px-4 py-3.5 ${className}`}
    >
      <Info size={18} className="mt-0.5 shrink-0 text-[var(--color-brand)]" aria-hidden />
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--color-text-muted)]">
        <p className="font-medium text-[var(--color-text)]">Expected payout formula</p>
        <p className="mt-1.5 font-mono text-xs sm:text-sm">
          Branch Net Share = Delivery Rider Share + (Order Subtotal − {gatewayRatePct}% Gateway Fee − Active
          Slab Commission)
        </p>

        {showValues && breakdownLkr && orderSubtotalLkr != null && (
          <div className="mt-4 space-y-3 border-t border-[var(--color-navy-border)]/60 pt-3">
            <p className="font-mono text-xs leading-relaxed text-[var(--color-text)] sm:text-sm">
              <span className="font-semibold text-[var(--color-brand)]">
                {formatMoney(breakdownLkr.netAmount)}
              </span>
              {' = '}
              <span className="text-emerald-400">{formatMoney(breakdownLkr.deliveryFee)}</span>
              {' + ('}
              <span>{formatMoney(orderSubtotalLkr)}</span>
              {' − '}
              <span className="text-amber-400">{formatMoney(breakdownLkr.gatewayFee)}</span>
              {' − '}
              <span className="text-red-400">{formatMoney(breakdownLkr.commissionFee)}</span>
              {convenienceFeeLkr > 0.001 && (
                <>
                  {' − '}
                  <span>{formatMoney(convenienceFeeLkr)}</span>
                </>
              )}
              )
            </p>

            <dl className="grid gap-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt>Delivery rider share</dt>
                <dd className="font-semibold tabular-nums text-emerald-400">
                  + {formatMoney(breakdownLkr.deliveryFee)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Order subtotal (commission base)</dt>
                <dd className="font-medium tabular-nums text-[var(--color-text)]">
                  {formatMoney(orderSubtotalLkr)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>{gatewayRatePct}% gateway fee</dt>
                <dd className="font-semibold tabular-nums text-amber-400">
                  − {formatMoney(breakdownLkr.gatewayFee)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>
                  Active slab commission
                  {slabRatePct != null ? ` (${slabRatePct}%)` : ''}
                </dt>
                <dd className="font-semibold tabular-nums text-red-400">
                  − {formatMoney(breakdownLkr.commissionFee)}
                </dd>
              </div>
              {(breakdownLkr.cancelledByBranchGatewayFee ?? 0) > 0.001 && (
                <div className="flex items-center justify-between gap-3">
                  <dt>
                    Branch cancellation penalties
                    {(breakdownLkr.cancelledByBranchOrderCount ?? 0) > 0
                      ? ` (${breakdownLkr.cancelledByBranchOrderCount} orders)`
                      : ''}
                  </dt>
                  <dd className="font-semibold tabular-nums text-orange-400">
                    − {formatMoney(breakdownLkr.cancelledByBranchGatewayFee ?? 0)}
                  </dd>
                </div>
              )}
              {(breakdownLkr.customerLateCancelNetAmount ?? 0) > 0.001 && (
                <div className="flex items-center justify-between gap-3">
                  <dt>Customer late-cancel recovery</dt>
                  <dd className="font-semibold tabular-nums text-emerald-400">
                    + {formatMoney(breakdownLkr.customerLateCancelNetAmount ?? 0)}
                  </dd>
                </div>
              )}
              {convenienceFeeLkr > 0.001 && (
                <div className="flex items-center justify-between gap-3">
                  <dt>Customer convenience fee</dt>
                  <dd className="font-semibold tabular-nums text-[var(--color-text-muted)]">
                    − {formatMoney(convenienceFeeLkr)}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-[var(--color-navy-border)]/60 pt-3">
                <dt className="text-sm font-semibold text-[var(--color-text)] sm:text-base">
                  Branch net share
                </dt>
                <dd className="text-lg font-bold tabular-nums text-[var(--color-brand)] sm:text-xl">
                  = {formatMoney(breakdownLkr.netAmount)}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {footnote && <p className="mt-3 text-xs">{footnote}</p>}
      </div>
    </div>
  );
}
