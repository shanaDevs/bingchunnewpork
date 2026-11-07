'use client';

import type { ReactNode } from 'react';

import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import {
  SUPER_ADMIN_CHART_CARD_CLASS,
  SUPER_ADMIN_CHART_HEIGHT,
} from '@/components/admin/deliveryAnalyticsUi';

export { SUPER_ADMIN_CHART_CARD_CLASS, SUPER_ADMIN_CHART_HEIGHT };

export const SUPER_ADMIN_CHART_CONTAINER_CLASS =
  'aspect-auto h-full w-full overflow-visible [&>.recharts-responsive-container]:h-full [&>.recharts-responsive-container]:min-h-0 [&>.recharts-responsive-container]:w-full';

export function SuperAdminHorizontalBarSkeleton({
  rows,
  labelWidthClass = 'w-20',
  barStartPercent = 70,
}: {
  rows: number;
  labelWidthClass?: string;
  barStartPercent?: number;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-4 px-2" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <DashSkel className={`h-3 shrink-0 ${labelWidthClass}`} />
          <DashSkel
            className="h-4 flex-1 rounded-full"
            style={{ width: `${barStartPercent - index * 12}%` }}
          />
        </div>
      ))}
    </div>
  );
}

type Props = {
  icon: ReactNode;
  iconClassName: string;
  title: string;
  subtitle: string;
  headerRight?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyLabel: string;
  skeletonRows?: number;
  skeletonLabelWidthClass?: string;
  skeletonBarStartPercent?: number;
  children: ReactNode;
};

export default function SuperAdminAnalyticsChartCard({
  icon,
  iconClassName,
  title,
  subtitle,
  headerRight,
  loading,
  empty,
  emptyLabel,
  skeletonRows = 4,
  skeletonLabelWidthClass = 'w-20',
  skeletonBarStartPercent = 70,
  children,
}: Props) {
  return (
    <div className={SUPER_ADMIN_CHART_CARD_CLASS}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg">{title}</h2>
            <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>
          </div>
        </div>
        {headerRight}
      </div>
      <div className="min-h-0 flex-1">
        {loading ? (
          <SuperAdminHorizontalBarSkeleton
            rows={skeletonRows}
            labelWidthClass={skeletonLabelWidthClass}
            barStartPercent={skeletonBarStartPercent}
          />
        ) : empty ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            {emptyLabel}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
