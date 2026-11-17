'use client';

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { formatMoney } from '@/lib/receipt';
import type { DeliveryCurrentPayoutCycle, DeliveryWalletSummary } from '@/lib/deliveryPayoutTypes';
import { deliveryWalletFetch } from '@/lib/deliveryWalletApi';
import { useDeliveryWalletUnlockToken } from '@/components/admin/DeliveryWalletUnlockContext';
import DeliveryWalletPayoutCalculation from '@/components/admin/DeliveryWalletPayoutCalculation';
import { cn } from '@/lib/utils';

function formatDateOnly(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) return ymd;
  return new Date(year, month - 1, day).toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function CurrentDeliveryPayoutCycleCard({
  cycle,
}: {
  cycle: DeliveryCurrentPayoutCycle;
}) {
  const breakdownId = useId();
  const unlockToken = useDeliveryWalletUnlockToken();
  const [expanded, setExpanded] = useState(false);
  const days = cycle.days || 30;

  const { data, isLoading, error } = useQuery({
    queryKey: ['delivery-wallet-cycle', cycle.from, cycle.through, unlockToken],
    queryFn: () =>
      deliveryWalletFetch(
        `/admin/delivery-wallet?from=${encodeURIComponent(cycle.from)}&to=${encodeURIComponent(cycle.through)}`,
        unlockToken,
      ) as Promise<DeliveryWalletSummary>,
    enabled: expanded && Boolean(unlockToken),
    retry: false,
  });

  const fetchError = error instanceof Error ? error.message : error ? 'Could not load breakdown' : null;

  return (
    <div
      className="overflow-hidden rounded-xl border border-[var(--color-navy-border,#334155)] bg-[var(--color-navy-card,#1e293b)]"
      aria-live="polite"
    >
      <button
        type="button"
        className={cn(
          'flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors sm:px-5',
          'hover:bg-[var(--color-navy-light,#334155)]/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand,#307ef2)]',
        )}
        aria-expanded={expanded}
        aria-controls={breakdownId}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[var(--color-text,#fff)]">
            <span className="font-semibold">Current payout cycle: </span>
            {formatBiweeklyPeriodLabel(cycle.from, cycle.cycleTo)}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {days}-day cycle closes {formatDateOnly(cycle.cycleTo)}
            {!expanded ? ' · Tap for calculation breakdown' : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-right text-lg font-bold tabular-nums text-[var(--color-text,#fff)]">
            {formatMoney(cycle.netForDelivery ?? 0)}
          </p>
          {expanded ? (
            <ChevronUp size={18} className="text-[var(--color-text-muted)]" aria-hidden />
          ) : (
            <ChevronDown size={18} className="text-[var(--color-text-muted)]" aria-hidden />
          )}
        </div>
      </button>

      {expanded && (
        <div
          id={breakdownId}
          className="border-t border-[var(--color-navy-border,#334155)] px-4 py-4 sm:px-5"
        >
          <p className="mb-4 text-xs text-[var(--color-text-muted)]">
            Totals for {formatDateOnly(cycle.from)} – {formatDateOnly(cycle.through)} (through today).
            The {days}-day cycle closes {formatDateOnly(cycle.cycleTo)}; payout is due after the cycle
            ends.
          </p>
          <DeliveryWalletPayoutCalculation
            summary={data}
            loading={isLoading}
            error={fetchError}
            branchListKey={`${cycle.from}-${cycle.through}`}
          />
        </div>
      )}
    </div>
  );
}