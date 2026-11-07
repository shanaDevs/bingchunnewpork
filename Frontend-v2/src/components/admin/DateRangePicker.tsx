'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Props = {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  onClear?: () => void;
  showClear?: boolean;
  className?: string;
  disabled?: boolean;
  /** Raise popover above admin modals (z-index 1200+) */
  inModal?: boolean;
  /** Override popover z-index class (e.g. z-[10050] for full-screen overlays) */
  popoverZIndexClass?: string;
  /** Dates after this day are not selectable. Defaults to today. */
  disableAfter?: Date;
  /** Dates before this day are not selectable. */
  disableBefore?: Date;
};

function formatRangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return 'Pick dates';
  const from = format(range.from, 'yyyy-MM-dd');
  if (!range.to) return from;
  const to = format(range.to, 'yyyy-MM-dd');
  return from === to ? from : `${from} → ${to}`;
}

export default function DateRangePicker({
  value,
  onChange,
  onClear,
  showClear = true,
  className,
  disabled,
  inModal = false,
  popoverZIndexClass,
  disableAfter,
  disableBefore,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasRange = !!(value?.from && value?.to);
  const popoverZIndex = popoverZIndexClass ?? (inModal ? 'z-[1250]' : undefined);

  const handleClear = () => {
    onChange(undefined);
    onClear?.();
    setOpen(false);
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          className={cn(
            'inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-normal whitespace-nowrap',
            'border-[var(--color-navy-border,#334155)] bg-[var(--color-input-bg,#0f172a)] text-[var(--color-text)]',
            'hover:bg-[var(--color-navy-light,#0f1428)] disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-[var(--color-brand,#307ef2)]" />
          <span>{formatRangeLabel(value)}</span>
        </PopoverTrigger>
        <PopoverContent
          className={cn('w-auto p-0', popoverZIndex)}
          positionerClassName={popoverZIndex}
          align="end"
          sideOffset={8}
        >
          <Calendar
            mode="range"
            defaultMonth={value?.from}
            selected={value}
            onSelect={(range) => {
              onChange(range);
              if (range?.from && range?.to) {
                setOpen(false);
              }
            }}
            numberOfMonths={2}
            disabled={[
              { after: disableAfter ?? new Date() },
              ...(disableBefore ? [{ before: disableBefore }] : []),
            ]}
          />
        </PopoverContent>
      </Popover>
      {hasRange && showClear && (
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          aria-label="Clear date range"
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium whitespace-nowrap',
            'border-[var(--color-navy-border,#334155)] bg-transparent text-[var(--color-text-muted)]',
            'hover:bg-[var(--color-navy-light,#0f1428)] hover:text-[var(--color-text)] disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <X className="size-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}
