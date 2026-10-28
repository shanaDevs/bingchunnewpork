'use client';

import { useState } from 'react';
import { ChevronDown, Layers } from 'lucide-react';

import {
  COMMISSION_SLABS,
  formatCommissionRate,
  getNextTierProgress,
  type MonthlySlabInfo,
  type SlabInfo,
} from '@/components/admin/commissionUtils';
import { formatMoneyAmount } from '@/lib/receipt';

type Props = {
  slabInfo?: SlabInfo | null;
  monthlySlabInfo?: MonthlySlabInfo[];
  compact?: boolean;
  /** Hide monthly base + rate summary (already shown in KPI cards). */
  hideBaseSummary?: boolean;
  /** Collapse full schedule behind a disclosure — default on dashboard. */
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-');
  const date = new Date(Number(year), Number(monthNum) - 1, 1);
  return date.toLocaleDateString('en-LK', { month: 'short', year: 'numeric' });
}


function TierScheduleTable({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-navy-border)]">
      <table className="w-full min-w-[360px] text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="px-3 py-2">Tier</th>
            <th className="px-3 py-2">Period sales range</th>
            <th className="px-3 py-2 text-right">Rate</th>
          </tr>
        </thead>
        <tbody>
          {COMMISSION_SLABS.map((slab, index) => {
            const isActive = index === activeIndex;
            return (
              <tr
                key={slab.label}
                className={[
                  'border-b border-[var(--color-navy-border)] last:border-b-0',
                  isActive ? 'bg-[var(--color-brand-subtle)]' : '',
                ].join(' ')}
              >
                <td className="px-3 py-2 font-medium text-[var(--color-text)]">
                  <span className="inline-flex items-center gap-1.5">
                    Tier {index + 1}
                    {isActive && (
                      <span className="rounded-full bg-[var(--color-brand)]/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[var(--color-brand)]">
                        Yours
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-[var(--color-text-muted)]">{slab.label}</td>
                <td className="px-3 py-2 text-right font-semibold text-[var(--color-text)]">
                  {formatCommissionRate(slab.rate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TierDisclosure({
  slabInfo,
  monthlySlabInfo,
  hideBaseSummary,
  defaultExpanded,
}: {
  slabInfo: SlabInfo;
  monthlySlabInfo?: MonthlySlabInfo[];
  hideBaseSummary?: boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const activeIndex = slabInfo.slabIndex;
  const next = getNextTierProgress(slabInfo.monthlyBase, activeIndex);

  return (
    <div className="rounded-xl border border-[var(--color-navy-border)]/80 bg-[var(--color-input-bg)]/25">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-input-bg)]/40"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand)]/10 text-[var(--color-brand)]">
          <Layers size={15} strokeWidth={2.25} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-semibold text-[var(--color-text)]">
              Tier {activeIndex + 1}
            </span>
            <span className="rounded-full bg-[var(--color-brand)]/12 px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand)]">
              {formatCommissionRate(slabInfo.effectiveRate)} rate
            </span>
          </div>
          {next && next.remaining > 0 && (
            <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
              LKR {formatMoneyAmount(next.remaining)} more period sales to Tier {next.nextTierNumber}{' '}
              ({formatCommissionRate(next.nextRate)})
            </p>
          )}
          {!next && (
            <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
              Best tier rate unlocked
            </p>
          )}
        </div>

        <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--color-text-muted)]">
          {expanded ? 'Hide' : 'Schedule'}
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {next && next.remaining > 0 && (
        <div className="px-3 pb-2">
          <div className="h-1 overflow-hidden rounded-full bg-[var(--color-navy-border)]/60">
            <div
              className="h-full rounded-full bg-[var(--color-brand)] transition-all duration-500"
              style={{ width: `${Math.max(next.progressPercent, 2)}%` }}
            />
          </div>
        </div>
      )}

      {expanded && (
        <div className="space-y-3 border-t border-[var(--color-navy-border)]/80 px-3 py-3">
          <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            Your commission rate updates when 15-day period item sales (after discounts) cross each
            milestone. Higher volume unlocks lower rates.
          </p>

          {slabInfo && !hideBaseSummary && (
            <p className="text-xs text-[var(--color-text)]">
              This period: LKR {formatMoneyAmount(slabInfo.monthlyBase)} at{' '}
              {formatCommissionRate(slabInfo.effectiveRate)}
            </p>
          )}

          {monthlySlabInfo && monthlySlabInfo.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {monthlySlabInfo.map((row) => (
                <span
                  key={row.month}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--color-navy-border)] bg-[var(--color-card)] px-2 py-0.5 text-[10px]"
                >
                  <span className="font-medium">{formatMonthLabel(row.month)}</span>
                  <span className="font-semibold text-[var(--color-brand)]">
                    {formatCommissionRate(row.effectiveRate)}
                  </span>
                </span>
              ))}
            </div>
          )}

          <TierScheduleTable activeIndex={activeIndex} />
        </div>
      )}
    </div>
  );
}

export default function CommissionSlabTable({
  slabInfo,
  monthlySlabInfo,
  compact,
  hideBaseSummary,
  collapsible = false,
  defaultExpanded,
}: Props) {
  const activeIndex = slabInfo?.slabIndex ?? 0;

  if (collapsible && slabInfo) {
    return (
      <TierDisclosure
        slabInfo={slabInfo}
        monthlySlabInfo={monthlySlabInfo}
        hideBaseSummary={hideBaseSummary}
        defaultExpanded={defaultExpanded}
      />
    );
  }

  return (
    <div className="space-y-3">
      {slabInfo && !hideBaseSummary && (
        <div
          className={[
            'rounded-lg border border-[var(--color-brand)]/30 bg-[var(--color-brand-subtle)]',
            compact ? 'px-3 py-2.5' : 'px-4 py-3',
          ].join(' ')}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">
            Period commission base
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
            LKR {formatMoneyAmount(slabInfo.monthlyBase)}
            <span className="ml-2 text-xs font-medium text-[var(--color-text-muted)]">
              Current rate: {formatCommissionRate(slabInfo.effectiveRate)}
            </span>
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            Commission is calculated from item subtotals after discounts (excluding delivery and
            convenience fees). Your rate is based on the branch&apos;s cumulative commissionable
            sales within each 15-day payout period.
          </p>
        </div>
      )}

      {monthlySlabInfo && monthlySlabInfo.length > 1 && (
        <div className="rounded-lg border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/30 px-3 py-2.5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Rates by period in this range
          </p>
          <div className="flex flex-wrap gap-2">
            {monthlySlabInfo.map((row) => (
              <span
                key={row.month}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-navy-border)] bg-[var(--color-card)] px-2.5 py-1 text-[11px] text-[var(--color-text)]"
              >
                <span className="font-medium">{formatMonthLabel(row.month)}</span>
                <span className="text-[var(--color-text-muted)]">
                  LKR {formatMoneyAmount(row.monthlyBase)}
                </span>
                <span className="font-semibold text-[var(--color-brand)]">
                  {formatCommissionRate(row.effectiveRate)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <TierScheduleTable activeIndex={activeIndex} />
    </div>
  );
}
