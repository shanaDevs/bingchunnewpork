'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { KPI_BOLD, KPI_LIGHT, brandKpiCardStyle, type DashKpiLightTone, type DashKpiTone } from '@/lib/dashboardTheme';
import { BrandKpiCardHeader } from '@/components/admin/BrandKpiIconBox';

type Props = {
  label: string;
  value: string | number | ReactNode;
  icon: LucideIcon;
  color?: string;
  tone?: DashKpiTone | DashKpiLightTone;
  href?: string;
  loading?: boolean;
  hint?: string;
  /** default = gradient fill · sales = compact gradient · brand = light tinted card · finance = white ledger card */
  variant?: 'default' | 'sales' | 'brand' | 'finance';
  /** Shorter dashboard tile — tighter padding and min-height */
  compact?: boolean;
  /** Neutral card surface without accent tint (branch admin dashboard). */
  plain?: boolean;
};

export default function DashboardKpiCard({
  label,
  value,
  icon: Icon,
  tone = 'blue',
  href,
  loading,
  hint,
  variant = 'default',
  compact = false,
  plain = false,
}: Props) {
  const isBrand = variant === 'brand';
  const isSales = variant === 'sales';
  const isFinance = variant === 'finance';
  const isBrandCompact = isBrand && compact;
  const isCompact = compact && !isBrand && !isSales && !isFinance;
  const bold = KPI_BOLD[tone as DashKpiTone] ?? KPI_BOLD.blue;
  const light = KPI_LIGHT[tone as DashKpiLightTone] ?? KPI_LIGHT.blue;

  const content = isFinance ? (
    <>
      <div className="relative z-[1] flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(48,126,242,0.1)] text-[var(--color-brand,#307ef2)]">
          <Icon size={15} strokeWidth={2.25} />
        </div>
        <p
          className="min-w-0 flex-1 pt-1 text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] text-muted"
          title={label}
        >
          {label}
        </p>
      </div>
      <p
        className="relative z-[1] mt-3 pr-10 text-[1.35rem] font-bold leading-none tracking-tight tabular-nums text-fg lg:text-[1.45rem]"
        title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
      >
        {loading ? '…' : value}
      </p>
      {hint ? (
        <p className="relative z-[1] mt-2 pr-10 text-[11px] leading-snug text-muted" title={hint}>
          {hint}
        </p>
      ) : null}
      <Icon
        size={56}
        className="pointer-events-none absolute right-2 bottom-1 text-[var(--color-brand,#307ef2)] opacity-[0.08]"
        strokeWidth={1.15}
      />
    </>
  ) : isBrandCompact ? (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <BrandKpiCardHeader icon={Icon} theme={light} title={label} size="sm" />
      <div className="flex min-h-0 flex-1 items-center">
        <p
          className="pt-0.5 text-[clamp(1rem,1.35vw,1.25rem)] font-bold leading-none tracking-tight tabular-nums whitespace-nowrap text-fg"
          title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
        >
          {loading ? '…' : value}
        </p>
      </div>
      {hint && (
        <span
          className="mt-auto inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-[9px] font-semibold"
          style={{ background: light.chipBg, color: light.chipFg }}
          title={hint}
        >
          {hint}
        </span>
      )}
    </div>
  ) : isBrand ? (
    <>
      <BrandKpiCardHeader icon={Icon} theme={light} title={label} />
      <p
        className="mt-3 text-[clamp(1.125rem,1.5vw,1.5rem)] font-bold leading-none tracking-tight tabular-nums text-fg"
        title={typeof value === 'string' ? value : undefined}
      >
        {loading ? '…' : value}
      </p>
      {hint && (
        <span
          className="mt-2 inline-flex max-w-full truncate rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
          style={{ background: light.chipBg, color: light.chipFg }}
          title={hint}
        >
          {hint}
        </span>
      )}
    </>
  ) : isCompact && hint ? (
    <>
      <div className="relative z-[1] flex shrink-0 items-start gap-2">
        <div
          className="admin-dash-stat__icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{
            background: bold.iconBg,
            color: bold.iconColor,
          }}
        >
          <Icon size={15} strokeWidth={2.25} />
        </div>
        <p
          className="min-w-0 flex-1 truncate pt-0.5 text-[10px] font-bold uppercase leading-tight tracking-[0.06em]"
          style={{ color: bold.label }}
          title={label}
        >
          {label}
        </p>
      </div>

      <div className="relative z-[1] flex min-h-0 flex-1 items-center">
        <p
          className="text-[clamp(1rem,1.35vw,1.25rem)] font-extrabold leading-none tracking-tight tabular-nums whitespace-nowrap"
          style={{ color: bold.fg }}
          title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
        >
          {loading ? '…' : value}
        </p>
      </div>

      <span
        className="relative z-[1] inline-flex max-w-full shrink-0 truncate rounded-full px-2 py-0.5 text-[9px] font-bold leading-snug"
        style={{ background: bold.badgeBg, color: bold.muted }}
        title={hint}
      >
        {hint}
      </span>

      <Icon
        size={52}
        className="pointer-events-none absolute bottom-1.5 right-1.5 opacity-[0.14]"
        strokeWidth={1.15}
        style={{ color: bold.iconColor }}
      />
    </>
  ) : (
    <>
      <div className="relative z-[1] flex items-start gap-2">
        <div
          className={
            isSales || isCompact
              ? 'admin-dash-stat__icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full'
              : 'admin-dash-stat__icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg'
          }
          style={{
            background: bold.iconBg,
            color: bold.iconColor,
          }}
        >
          <Icon size={isSales || isCompact ? 15 : 17} strokeWidth={2.25} />
        </div>
        <p
          className={
            isSales || isCompact
              ? 'min-w-0 flex-1 truncate pt-0.5 text-[10px] font-bold uppercase leading-tight tracking-[0.06em]'
              : 'min-w-0 text-sm font-bold uppercase leading-snug tracking-[0.06em] line-clamp-2'
          }
          style={{ color: bold.label }}
          title={label}
        >
          {label}
        </p>
      </div>

      <p
        className={
          isSales || isCompact
            ? 'relative z-[1] mt-2 text-[clamp(1rem,1.35vw,1.25rem)] font-extrabold leading-none tracking-tight tabular-nums whitespace-nowrap'
            : 'relative z-[1] mt-4 break-words text-lg font-bold leading-tight tracking-tight tabular-nums sm:text-xl lg:text-2xl'
        }
        style={{ color: bold.fg }}
        title={typeof value === 'string' ? value : undefined}
      >
        {loading ? '…' : value}
      </p>

      {hint && (
        <span
          className={
            isSales || isCompact
              ? 'relative z-[1] mt-1.5 inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[9px] font-bold leading-snug'
              : 'relative z-[1] mt-3 inline-flex max-w-full rounded-full px-3 py-1 text-[10px] font-bold leading-snug whitespace-normal'
          }
          style={{ background: bold.badgeBg, color: bold.muted }}
          title={hint}
        >
          {hint}
        </span>
      )}

      {!isSales && (
        <Icon
          size={isCompact ? 52 : 76}
          className="pointer-events-none absolute bottom-1.5 right-1.5 opacity-[0.14]"
          strokeWidth={1.15}
          style={{ color: bold.iconColor }}
        />
      )}
    </>
  );

  const plainClass = plain ? ' brand-kpi-card--plain' : '';

  const className = isFinance
    ? 'relative flex h-full min-h-[7.25rem] flex-col overflow-hidden rounded-[10px] border border-[var(--color-navy-border,#e2e8f0)] bg-[var(--color-navy-card,#fff)] p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.04)]'
    : isBrand
      ? isBrandCompact
        ? `brand-kpi-card relative flex h-full min-h-[7rem] flex-col gap-1 overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5${plainClass}`
        : `brand-kpi-card relative flex h-full min-h-[7.5rem] flex-col overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5${plainClass}`
      : isSales || isCompact
        ? 'admin-dash-stat admin-dash-stat--compact relative flex min-h-[6.5rem] flex-col gap-3 overflow-hidden rounded-2xl border-0 p-3.5 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg'
        : 'admin-dash-stat relative flex h-full min-h-[10.5rem] flex-col overflow-hidden rounded-2xl border-0 p-5 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg';

  const style = isFinance
    ? undefined
    : isBrand
      ? plain
        ? undefined
        : brandKpiCardStyle(light)
      : { background: bold.bg, color: bold.fg };

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}
