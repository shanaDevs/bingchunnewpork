'use client';

import MonthPickerSelect, { currentMonthKey } from '@/components/admin/MonthPickerSelect';
import {
  todayDateStr,
  type WalletPeriodFilterApi,
} from '@/components/admin/useWalletPeriodFilter';
import { cn } from '@/lib/utils';

type Props = {
  filter: WalletPeriodFilterApi;
  className?: string;
};

const fieldClass =
  'input-field h-10 rounded-[10px] border border-[var(--color-navy-border,#e2e8f0)] bg-[var(--color-navy-card,#fff)] py-0 text-[13px]';

export default function WalletPeriodFilterBar({ filter, className = '' }: Props) {
  const {
    draftMonth,
    draftFrom,
    draftTo,
    monthDisabled,
    canApply,
    selectMonth,
    setCustomFrom,
    setCustomTo,
    apply,
    reset,
  } = filter;

  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 max-lg:flex-wrap lg:flex-nowrap',
        className,
      )}
    >
      <MonthPickerSelect
        value={monthDisabled ? draftMonth : draftMonth || currentMonthKey()}
        onChange={selectMonth}
        disabled={monthDisabled}
        className="h-10 w-[172px] min-w-[172px] rounded-[10px] text-[13px]"
      />

      <label className="inline-flex items-center">
        <span className="sr-only">From date</span>
        <input
          id="wallet-period-from"
          type="date"
          value={draftFrom}
          max={draftTo || todayDateStr()}
          onChange={(e) => setCustomFrom(e.target.value)}
          className={cn(fieldClass, 'w-[138px]')}
        />
      </label>

      <label className="inline-flex items-center">
        <span className="sr-only">To date</span>
        <input
          id="wallet-period-to"
          type="date"
          value={draftTo}
          min={draftFrom || undefined}
          max={todayDateStr()}
          onChange={(e) => setCustomTo(e.target.value)}
          className={cn(fieldClass, 'w-[138px]')}
        />
      </label>

      <button
        type="button"
        onClick={apply}
        disabled={!canApply}
        className="h-10 rounded-[10px] bg-[#307ef2] px-4 text-[13px] font-semibold !text-white disabled:opacity-50"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={reset}
        className="h-10 rounded-[10px] border border-[var(--color-navy-border,#dbe3ee)] bg-[var(--color-navy-card,#fff)] px-4 text-[13px] font-semibold text-fg hover:bg-[var(--color-input-bg)]"
      >
        Reset
      </button>
    </div>
  );
}
