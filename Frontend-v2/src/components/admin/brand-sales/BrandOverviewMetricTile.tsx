'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  /** Revenue or other sub-value below the main value (e.g. branch sales) */
  secondary?: ReactNode;
  /** Period comparison / status — only when caller has real data */
  trend?: ReactNode;
  tileClassName: string;
  iconClassName: string;
  valueClassName?: string;
  valueTitle?: string;
};

export default function BrandOverviewMetricTile({
  icon: Icon,
  label,
  value,
  secondary,
  trend,
  tileClassName,
  iconClassName,
  valueClassName = 'text-[17px] font-bold leading-tight tabular-nums text-fg',
  valueTitle,
}: Props) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tileClassName}`}
      >
        <Icon size={17} strokeWidth={2.25} className={iconClassName} aria-hidden />
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-[11px] font-medium leading-tight text-muted">{label}</p>
        <div className={`truncate ${valueClassName}`} title={valueTitle}>
          {value}
        </div>
        {trend ? (
          <p className="mt-0.5 truncate text-[10px] font-semibold leading-tight tabular-nums">
            {trend}
          </p>
        ) : null}
        {secondary ? (
          <p className="mt-0.5 truncate text-[11px] leading-tight tabular-nums text-muted">
            {secondary}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Shared body grid for overview KPI pair cards */
export const brandOverviewKpiGridClassName =
  'grid w-full grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2';

/** Centers the KPI grid vertically in the card body (matches sibling card height in the hero row) */
export const brandOverviewKpiBodyClassName = 'flex min-h-0 flex-1 items-center px-4 py-3.5';

export const brandOverviewCardHeaderClassName =
  'border-b border-[#e2e8f0] px-4 py-3';

export const brandOverviewCardShellClassName = 'card flex h-full min-h-0 flex-col overflow-hidden';
