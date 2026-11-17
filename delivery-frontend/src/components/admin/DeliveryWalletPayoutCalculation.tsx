'use client';

import { Info, Loader2, Undo2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import DeliveryFeesByBranchBreakdown from '@/components/admin/DeliveryFeesByBranchBreakdown';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import type { DeliveryWalletSummary } from '@/lib/deliveryPayoutTypes';
import { cn } from '@/lib/utils';

type Props = {
  summary: DeliveryWalletSummary | null | undefined;
  loading?: boolean;
  error?: string | null;
  showBranches?: boolean;
  branchListKey?: string;
  className?: string;
};

export default function DeliveryWalletPayoutCalculation({
  summary,
  loading = false,
  error = null,
  showBranches = true,
  branchListKey,
  className,
}: Props) {
  if (loading) {
    return (
      <div
        className={cn(
          'flex items-center justify-center gap-2 py-8 text-sm text-[var(--color-text-muted)]',
          className,
        )}
      >
        <Loader2 size={18} className="animate-spin text-[var(--color-brand,#307ef2)]" />
        Loading calculation…
      </div>
    );
  }

  if (error) {
    return (
      <p className={cn('text-sm text-red-600 dark:text-red-300', className)} role="alert">
        {error}
      </p>
    );
  }

  if (!summary) return null;

  const branches = summary.branches ?? [];

  return (
    <div className={cn('space-y-4', className)}>
      <div className="rounded-xl border border-[var(--color-navy-border,#334155)]/80 bg-input-bg/25 px-4 py-3.5">
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--color-text-muted)]">
          <div className="flex items-center gap-2">
            <p className="font-medium text-[var(--color-text,#fff)]">Payout calculation</p>
            <Popover>
              <PopoverTrigger
                type="button"
                className="inline-flex rounded-lg p-1 text-[var(--color-brand,#307ef2)] hover:bg-navy-light/60"
                aria-label="Show payout formula"
              >
                <Info size={16} />
              </PopoverTrigger>
              <PopoverContent
                className="z-[10050] max-w-sm font-mono text-xs"
                positionerClassName="z-[10050]"
                side="bottom"
                align="start"
                sideOffset={6}
              >
                Net for delivery = (Gross − {summary.platformFeePercent}% platform) −{' '}
                {summary.gatewayFeePercent}% gateway
              </PopoverContent>
            </Popover>
          </div>
          <dl className="mt-3 space-y-2 border-t border-[var(--color-navy-border,#334155)]/60 pt-3">
            <div className="flex items-center justify-between gap-3">
              <dt>Gross delivery fees</dt>
              <dd className="font-semibold tabular-nums text-[var(--color-text,#fff)]">
                {formatMoneyAmount(summary.grossDeliveryFee)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs">
              <dt className="pl-3">Active orders ({summary.orderCount})</dt>
              <dd className="tabular-nums">{formatMoneyAmount(summary.fromActiveOrders)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs">
              <dt className="inline-flex items-center gap-1.5 pl-3">
                <Undo2 size={12} />
                Late-cancel retained ({summary.lateCancelCount})
              </dt>
              <dd className="tabular-nums">{formatMoneyAmount(summary.fromLateCancels)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-navy-border,#334155)]/40 pt-2">
              <dt>− Platform fee ({summary.platformFeePercent}%)</dt>
              <dd className="font-semibold tabular-nums text-red-700 dark:text-red-300">
                − {formatMoneyAmount(summary.platformFee)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>= After platform</dt>
              <dd className="font-medium tabular-nums text-[var(--color-text,#fff)]">
                {formatMoneyAmount(summary.afterPlatformFee)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>− Gateway fee ({summary.gatewayFeePercent}%)</dt>
              <dd className="font-semibold tabular-nums text-red-700 dark:text-red-300">
                − {formatMoneyAmount(summary.gatewayFee)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-navy-border,#334155)]/60 pt-2">
              <dt className="font-medium text-[var(--color-text,#fff)]">= Net for delivery</dt>
              <dd className="text-base font-bold tabular-nums text-[var(--color-brand,#307ef2)]">
                {formatMoney(summary.netForDelivery)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {showBranches && branches.length > 0 && (
        <DeliveryFeesByBranchBreakdown
          key={branchListKey}
          branches={branches}
          grossDeliveryFee={summary.grossDeliveryFee}
          platformFeePercent={summary.platformFeePercent}
          gatewayFeePercent={summary.gatewayFeePercent}
        />
      )}
    </div>
  );
}