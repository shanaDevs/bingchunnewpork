'use client';

import { Bike, CheckCircle, Loader2 } from 'lucide-react';
import { formatMoney } from '@/lib/receipt';
import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { cn } from '@/lib/utils';
import type { DeliveryPayoutDueRow } from '@/lib/deliveryPayoutTypes';

type PropsBase = {
  rows: DeliveryPayoutDueRow[];
  loading?: boolean;
  onView?: (row: DeliveryPayoutDueRow) => void;
};

type Props =
  | (PropsBase & { allowPay?: true; onReviewAndPay: (row: DeliveryPayoutDueRow) => void })
  | (PropsBase & { allowPay: false; onReviewAndPay?: never });

export default function DeliveryPayoutsDuePanel({
  rows,
  loading,
  onView,
  onReviewAndPay,
  allowPay = true,
}: Props) {
  const count = rows.length;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-card)]">
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-text-muted)]">
          <Loader2 size={18} className="animate-spin text-[var(--color-brand)]" />
          Loading delivery payouts due…
        </div>
      )}

      {!loading && count === 0 && (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <CheckCircle size={28} />
          </div>
          <p className="text-base font-semibold text-[var(--color-text)]">No delivery payouts due</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--color-text-muted)]">
            {allowPay
              ? 'Completed 15-day delivery periods appear here for Super Admin payout.'
              : 'Completed 15-day periods. Pay from main admin Wallet → Payouts Due → Delivery.'}
          </p>
        </div>
      )}

      {!loading && count > 0 && (
        <>
          <div className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-navy-border)] px-4 py-3 sm:px-5">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Delivery payouts due</h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              {count} period{count === 1 ? '' : 's'} · 15-day cycle
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="px-3 py-2.5 font-semibold">Partner</th>
                  <th className="px-3 py-2.5 font-semibold">Period</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Gross</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Net due</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Orders</th>
                  <th className="px-3 py-2.5 text-right font-semibold">View</th>
                  {allowPay ? (
                    <th className="px-3 py-2.5 text-right font-semibold">Action</th>
                  ) : (
                    <th className="px-3 py-2.5 text-right font-semibold">Status</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.periodFrom}-${row.periodTo}`}
                    className="border-b border-[var(--color-navy-border)]/70 last:border-b-0 hover:bg-[var(--color-input-bg)]/40"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 font-medium text-[var(--color-text)]">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/12 text-sky-500">
                          <Bike size={14} strokeWidth={2.25} />
                        </span>
                        Delivery Partner
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-[var(--color-text-muted)]">
                      {formatBiweeklyPeriodLabel(row.periodFrom, row.periodTo)}
                      <span className="ml-1.5 text-[10px] font-semibold text-[var(--color-text)]">
                        {row.days} days
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text)]">
                      {formatMoney(row.grossDeliveryFee)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--color-text)]">
                      {formatMoney(row.netForDelivery)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text)]">
                      {row.orderCount}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onView?.(row)}
                        className={cn(
                          'inline-flex items-center rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5',
                          'text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)]',
                        )}
                      >
                        View
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {allowPay ? (
                        row.payable ? (
                          <button
                            type="button"
                            onClick={() => onReviewAndPay?.(row)}
                            className={cn(
                              'inline-flex items-center rounded-lg border border-[var(--color-brand)] px-3 py-1.5',
                              'text-xs font-semibold text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand-subtle)]',
                            )}
                          >
                            Review & Pay
                          </button>
                        ) : (
                          <span className="text-[10px] font-medium text-[var(--color-text-muted)]">
                            Pay earlier period first
                          </span>
                        )
                      ) : (
                        <span
                          className={cn(
                            'text-[10px] font-semibold',
                            row.payable
                              ? 'text-emerald-400'
                              : 'text-[var(--color-text-muted)]',
                          )}
                        >
                          {row.payable ? 'Ready to pay' : 'Earlier period pending'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
