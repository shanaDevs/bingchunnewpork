'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export function formatMonthKeyLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('en-LK', { month: 'long', year: 'numeric' });
}

export function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

type Props = {
  /** Empty string shows the "Select month" placeholder. */
  value: string;
  onChange: (monthKey: string) => void;
  minYear?: number;
  maxYear?: number;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
};

export default function MonthPickerSelect({
  value,
  onChange,
  minYear = 2020,
  maxYear = new Date().getFullYear(),
  className = '',
  disabled = false,
  placeholder = 'Select month',
}: Props) {
  const [open, setOpen] = useState(false);
  const hasValue = /^\d{4}-\d{2}$/.test(value);
  const [viewYear, setViewYear] = useState(() =>
    hasValue ? Number(value.split('-')[0]) : maxYear,
  );

  const selectedYear = hasValue ? Number(value.split('-')[0]) : NaN;
  const selectedMonth = hasValue ? Number(value.split('-')[1]) : NaN;

  const years = useMemo(() => {
    const list: number[] = [];
    for (let year = maxYear; year >= minYear; year -= 1) {
      list.push(year);
    }
    return list;
  }, [minYear, maxYear]);

  const selectMonth = (monthIndex: number) => {
    const monthKey = `${viewYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    onChange(monthKey);
    setOpen(false);
  };

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (next) setViewYear(hasValue ? selectedYear : maxYear);
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        className={`payment-history-header__branch-select input-field inline-flex min-w-[10rem] items-center justify-between gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
        aria-label="Select month"
        onMouseDown={(event) => event.preventDefault()}
      >
        <span className={`truncate ${hasValue ? '' : 'text-[var(--color-text-muted)]'}`.trim()}>
          {hasValue ? formatMonthKeyLabel(value) : placeholder}
        </span>
        <ChevronDown size={14} className="shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-[17rem] p-3" align="end" sideOffset={8}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-md p-1 text-muted hover:bg-navy-light hover:text-fg"
            aria-label="Previous year"
            disabled={viewYear <= minYear}
            onClick={() => setViewYear((year) => Math.max(minYear, year - 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <select
            value={viewYear}
            onChange={(event) => setViewYear(Number(event.target.value))}
            className="input-field min-w-0 flex-1 py-1.5 text-sm font-semibold"
            aria-label="Select year"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-md p-1 text-muted hover:bg-navy-light hover:text-fg"
            aria-label="Next year"
            disabled={viewYear >= maxYear}
            onClick={() => setViewYear((year) => Math.min(maxYear, year + 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_LABELS.map((label, index) => {
            const isSelected =
              hasValue && viewYear === selectedYear && index + 1 === selectedMonth;
            const isFuture =
              viewYear > maxYear ||
              (viewYear === maxYear && index > new Date().getMonth());
            return (
              <button
                key={label}
                type="button"
                disabled={isFuture}
                className={[
                  'rounded-lg px-2 py-2 text-xs font-medium transition',
                  isSelected
                    ? 'bg-brand text-white'
                    : 'text-fg hover:bg-navy-light/60 disabled:cursor-not-allowed disabled:opacity-40',
                ].join(' ')}
                onClick={() => selectMonth(index)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
