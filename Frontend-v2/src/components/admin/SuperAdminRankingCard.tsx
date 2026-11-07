'use client';

import type { ReactNode } from 'react';

import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import ProductImage from '@/components/ui/ProductImage';

export type SuperAdminRankingRow = {
  id: string;
  name: string;
  imageUrl?: string | null;
  metric?: string;
  value: string;
  progress: number;
};

type Props = {
  title: string;
  nameLabel?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  metricLabel?: string;
  valueLabel?: string;
  rows: SuperAdminRankingRow[];
  loading?: boolean;
  empty?: string;
  showImage?: boolean;
};

export default function SuperAdminRankingCard({
  title,
  nameLabel = 'Branch',
  subtitle,
  headerRight,
  metricLabel = 'Orders',
  valueLabel = 'Revenue',
  rows,
  loading,
  empty = 'No data for this period',
  showImage = false,
}: Props) {
  return (
    <div className="card super-admin-rank-card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-navy-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p> : null}
        </div>
        {headerRight}
      </div>

      <div className="flex items-center gap-2 px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span className="w-5 text-center">#</span>
        {showImage ? <span className="w-8 shrink-0" aria-hidden /> : null}
        <span className="min-w-0 flex-1 truncate">{nameLabel}</span>
        <span className="w-14 shrink-0 text-right">{metricLabel}</span>
        <span className="w-[5.5rem] shrink-0 text-right">{valueLabel}</span>
      </div>

      {loading ? (
        <ul className="flex flex-1 flex-col px-2 pb-2" aria-hidden>
          {Array.from({ length: 5 }, (_, index) => (
            <li key={index} className="super-admin-rank-card__row">
              <DashSkel className="h-3 w-4 shrink-0" />
              {showImage ? <DashSkel className="h-8 w-8 shrink-0 rounded-md" /> : null}
              <div className="min-w-0 flex-1">
                <DashSkel className="h-3.5 w-[70%] max-w-[10rem]" />
                <DashSkel className="mt-1 h-1 w-full rounded-full" />
              </div>
              <DashSkel className="h-3 w-10 shrink-0" />
              <DashSkel className="h-3 w-14 shrink-0" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 py-6 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-1 flex-col px-2 pb-2">
          {rows.map((row, index) => (
            <li key={row.id} className="super-admin-rank-card__row">
              <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted">
                {index + 1}
              </span>
              {showImage ? (
                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-navy-light/60">
                  <ProductImage
                    name={row.name}
                    imageUrl={row.imageUrl}
                    contain
                    className="h-full w-full object-contain p-0.5"
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-fg" title={row.name}>
                  {row.name}
                </p>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-navy-light/80">
                  <div
                    className="super-admin-rank-card__bar h-full rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, row.progress))}%` }}
                  />
                </div>
              </div>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">
                {row.metric ?? '—'}
              </span>
              <span className="w-[5.5rem] shrink-0 text-right text-xs font-semibold tabular-nums text-fg">
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
