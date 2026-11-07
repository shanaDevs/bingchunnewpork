'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export const SUPER_ADMIN_CHART_HEIGHT = 248;
export const SUPER_ADMIN_CHART_CARD_CLASS =
  'card flex h-full min-h-[380px] flex-col !rounded-[18px] border-[#E5EAF2] p-4 sm:p-5';

const AVATAR_PALETTES = [
  { bg: 'bg-sky-100 dark:bg-sky-500/15', text: 'text-sky-700 dark:text-sky-300' },
  { bg: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-orange-100 dark:bg-orange-500/15', text: 'text-orange-700 dark:text-orange-300' },
  { bg: 'bg-blue-100 dark:bg-brand/15', text: 'text-blue-700 dark:text-brand-light' },
  { bg: 'bg-rose-100 dark:bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300' },
  { bg: 'bg-teal-100 dark:bg-teal-500/15', text: 'text-teal-700 dark:text-teal-300' },
  { bg: 'bg-indigo-100 dark:bg-indigo-500/15', text: 'text-indigo-700 dark:text-indigo-300' },
] as const;

export function riderInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function avatarPalette(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

export function RiderAvatar({
  name,
  seed,
  size = 'sm',
  premium = false,
  photoUrl,
}: {
  name: string;
  seed: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  premium?: boolean;
  photoUrl?: string | null;
}) {
  const palette = premium
    ? { bg: 'bg-brand/15 dark:bg-brand/20', text: 'text-brand dark:text-brand-light' }
    : avatarPalette(seed);
  const dim =
    size === '2xl'
      ? 'h-20 w-20 text-xl'
      : size === 'xl'
        ? 'h-14 w-14 text-lg'
        : size === 'lg'
          ? 'h-12 w-12 text-base'
          : size === 'md'
            ? 'h-11 w-11 text-sm'
            : 'h-9 w-9 text-xs';

  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold tracking-tight ${palette.bg} ${palette.text} ${
        premium ? 'ring-2 ring-brand/25 ring-offset-2 ring-offset-white dark:ring-offset-navy-card' : ''
      }`}
      aria-hidden
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        riderInitials(name)
      )}
    </div>
  );
}

type MetricIconTone = 'blue' | 'green' | 'red' | 'neutral';

const METRIC_ICON_TONE: Record<MetricIconTone, string> = {
  blue: 'bg-brand/10 text-brand dark:bg-brand/15 dark:text-brand-light',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  red: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  neutral: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
};

const METRIC_VALUE_TONE: Record<MetricIconTone, string> = {
  blue: 'text-brand dark:text-brand-light',
  green: 'text-emerald-600 dark:text-emerald-400',
  red: 'text-orange-600 dark:text-orange-400',
  neutral: 'text-slate-700 dark:text-slate-300',
};

export function AnalyticsMetricCell({
  icon: Icon,
  label,
  value,
  unit,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: MetricIconTone;
}) {
  const showUnit = unit && value != null && value !== '—';

  return (
    <div className="flex min-w-0 flex-col gap-2 bg-navy-card px-4 py-3.5 sm:px-5">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${METRIC_ICON_TONE[tone]}`}
      >
        <Icon size={15} strokeWidth={2.25} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium leading-tight text-muted">{label}</p>
        <div className="mt-1 flex items-baseline gap-1">
          <span className={`text-lg font-semibold tabular-nums leading-none ${METRIC_VALUE_TONE[tone]}`}>
            {value ?? '—'}
          </span>
          {showUnit && <span className="text-xs font-normal text-muted">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsKpiItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums text-fg">{value ?? '—'}</p>
    </div>
  );
}

export function RiderDetailKpiItem({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
  compact = false,
  premium = false,
  emphasized = false,
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: MetricIconTone;
  compact?: boolean;
  premium?: boolean;
  emphasized?: boolean;
}) {
  const iconSize = premium ? 16 : compact ? 12 : 14;
  const iconBox = premium ? 'h-8 w-8 rounded-lg' : compact ? 'h-6 w-6 rounded-md' : 'mt-0.5 h-7 w-7 rounded-md';
  const labelClass = premium
    ? 'text-[13px] text-muted'
    : compact
      ? 'text-[11px] leading-tight text-muted'
      : 'text-xs text-muted';
  const valueClass = premium
    ? emphasized
      ? 'mt-1.5 text-2xl font-semibold'
      : 'mt-1.5 text-xl font-semibold'
    : compact
      ? 'mt-1 text-sm font-semibold'
      : 'mt-1.5 text-base font-semibold';

  return (
    <div className={`flex items-start ${premium ? 'gap-3' : compact ? 'gap-2' : 'gap-3'}`}>
      {Icon ? (
        <div
          className={`flex shrink-0 items-center justify-center ${iconBox} ${METRIC_ICON_TONE[tone]}`}
        >
          <Icon size={iconSize} strokeWidth={2.25} aria-hidden />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${labelClass}`}>{label}</p>
        <p className={`tabular-nums leading-snug ${METRIC_VALUE_TONE[tone]} ${valueClass}`}>
          {value ?? '—'}
        </p>
      </div>
    </div>
  );
}
