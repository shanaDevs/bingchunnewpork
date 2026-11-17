'use client';

import { useState, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { PERIOD_FILTER } from '@/lib/dashboardTheme';
import { todayDateString } from '@/lib/datetime';

export type DashboardPeriod = 'today' | 'month' | 'year' | 'custom';

const PRESET_PERIODS: Array<{ id: Exclude<DashboardPeriod, 'custom'>; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
];

type Props = {
  period: DashboardPeriod;
  customRange: DateRange | undefined;
  onPeriodChange: (period: Exclude<DashboardPeriod, 'custom'>) => void;
  onCustomRangeChange: (range: DateRange | undefined) => void;
  compact?: boolean;
  className?: string;
  /** When set, the active Today/Month/Year pill also shows the concrete date range. */
  showPresetDates?: boolean;
};

function pillStyle(active: boolean): CSSProperties {
  return {
    background: active ? PERIOD_FILTER.activeBg : PERIOD_FILTER.inactiveBg,
    color: '#ffffff',
  };
}

function formatPresetDateRange(period: Exclude<DashboardPeriod, 'custom'>): string | null {
  if (period === 'today') return null;
  const range = orderDateRange(period);
  if (!range.startDate || !range.endDate) return null;
  const from = new Date(`${range.startDate}T00:00:00`);
  const to = new Date(`${range.endDate}T00:00:00`);
  return `${format(from, 'MMM d')} – ${format(to, 'MMM d')}`;
}

export default function DashboardPeriodFilter({
  period,
  customRange,
  onPeriodChange,
  onCustomRangeChange,
  compact = false,
  className,
  showPresetDates = false,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const customActive = period === 'custom' && !!(customRange?.from && customRange?.to);

  const customLabel =
    customActive && customRange?.from && customRange?.to
      ? `${format(customRange.from, 'MMM d')} – ${format(customRange.to, 'MMM d')}`
      : 'Custom Range';

  const hasSelection = !!(customRange?.from || customRange?.to);

  const handleClear = () => {
    onCustomRangeChange(undefined);
    onPeriodChange('month');
    setCustomOpen(false);
  };

  const buttonClass = cn(
    'admin-dash-period-btn rounded-full text-xs font-semibold transition-all whitespace-nowrap',
    compact ? 'px-3 py-1.5' : 'px-4 py-2',
  );

  return (
    <div className={cn('flex items-center', compact ? 'flex-nowrap gap-1.5' : 'flex-wrap gap-2', className)}>
      {PRESET_PERIODS.map((item) => {
        const dateSuffix =
          showPresetDates && period === item.id ? formatPresetDateRange(item.id) : null;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onPeriodChange(item.id)}
            className={buttonClass}
            style={pillStyle(period === item.id)}
          >
            {dateSuffix ? `${item.label} · ${dateSuffix}` : item.label}
          </button>
        );
      })}

      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger
          className={cn(buttonClass, compact && customActive && 'max-w-[7.5rem] truncate')}
          style={pillStyle(customActive)}
        >
          {customLabel}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end" sideOffset={8}>
          <Calendar
            mode="range"
            defaultMonth={customRange?.from}
            selected={customRange}
            onSelect={(range) => {
              onCustomRangeChange(range);
              if (range?.from && range?.to) {
                setCustomOpen(false);
              }
            }}
            numberOfMonths={2}
            disabled={{ after: new Date() }}
          />
          {hasSelection && (
            <div className="flex justify-end border-t border-[var(--color-navy-border,#e2e8f0)] p-2">
              <button
                type="button"
                onClick={handleClear}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium',
                  'border-[var(--color-navy-border,#334155)] text-[var(--color-text-muted)]',
                  'hover:bg-[var(--color-navy-light,#f1f5f9)] hover:text-[var(--color-text)]',
                )}
              >
                <X className="size-3.5" />
                Clear
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function orderDateRange(
  period: DashboardPeriod,
  customRange?: DateRange,
): { startDate?: string; endDate?: string } {
  const todayStr = todayDateString();

  if (period === 'custom' && customRange?.from && customRange?.to) {
    return {
      startDate: format(customRange.from, 'yyyy-MM-dd'),
      endDate: format(customRange.to, 'yyyy-MM-dd'),
    };
  }
  if (period === 'today') {
    return { startDate: todayStr, endDate: todayStr };
  }
  if (period === 'month') {
    const [y, m] = todayStr.split('-').map(Number);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    return { startDate, endDate: todayStr };
  }
  if (period === 'year') {
    const y = todayStr.slice(0, 4);
    return { startDate: `${y}-01-01`, endDate: todayStr };
  }
  return {};
}

export function formatDashboardPeriodLabel(
  period: DashboardPeriod,
  customRange?: DateRange,
  options?: { includeDates?: boolean },
): string {
  if (period === 'custom' && customRange?.from && customRange?.to) {
    return `${format(customRange.from, 'd MMM yyyy')} – ${format(customRange.to, 'd MMM yyyy')}`;
  }
  const labels: Record<Exclude<DashboardPeriod, 'custom'>, string> = {
    today: 'Today',
    month: 'This Month',
    year: 'This Year',
  };
  const base = labels[period as Exclude<DashboardPeriod, 'custom'>] ?? 'This Month';
  if (!options?.includeDates) return base;

  const range = orderDateRange(period, customRange);
  if (!range.startDate || !range.endDate) return base;
  const from = new Date(`${range.startDate}T00:00:00`);
  const to = new Date(`${range.endDate}T00:00:00`);
  if (period === 'today') {
    return format(from, 'd MMM yyyy');
  }
  return `${format(from, 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')}`;
}

export type DashboardStatsTier = 'summary' | 'charts' | 'charts-wallet' | 'details';

export function buildDashboardStatsUrl(
  period: DashboardPeriod,
  customRange?: DateRange,
  tier?: DashboardStatsTier,
): string {
  const tierParam = tier ? `&tier=${tier}` : '';
  if (period === 'custom' && customRange?.from && customRange?.to) {
    const from = format(customRange.from, 'yyyy-MM-dd');
    const to = format(customRange.to, 'yyyy-MM-dd');
    return `/admin/dashboard?period=custom&from=${from}&to=${to}${tierParam}`;
  }
  return `/admin/dashboard?period=${period}${tierParam}`;
}

export function buildBranchAnalyticsUrl(
  period: DashboardPeriod,
  customRange?: DateRange,
): string {
  if (period === 'custom' && customRange?.from && customRange?.to) {
    const from = format(customRange.from, 'yyyy-MM-dd');
    const to = format(customRange.to, 'yyyy-MM-dd');
    return `/admin/reports/branch-analytics?period=custom&from=${from}&to=${to}`;
  }
  return `/admin/reports/branch-analytics?period=${period}`;
}
