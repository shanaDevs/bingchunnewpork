'use client';

import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { formatMoney } from '@/lib/receipt';
import type { DeliveryCurrentPayoutCycle } from '@/lib/deliveryPayoutTypes';

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
  const days = cycle.days || 30;
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-navy-border,#334155)] bg-[var(--color-navy-card,#1e293b)] px-4 py-3 sm:px-5"
      aria-live="polite"
    >
      <div className="min-w-0">
        <p className="text-sm text-[var(--color-text,#fff)]">
          <span className="font-semibold">Current payout cycle: </span>
          {formatBiweeklyPeriodLabel(cycle.from, cycle.cycleTo)}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          {days}-day cycle closes {formatDateOnly(cycle.cycleTo)}
        </p>
      </div>
      <p className="shrink-0 text-right text-lg font-bold tabular-nums text-[var(--color-text,#fff)]">
        {formatMoney(cycle.netForDelivery ?? 0)}
      </p>
    </div>
  );
}
