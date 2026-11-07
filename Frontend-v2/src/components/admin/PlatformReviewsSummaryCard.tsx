'use client';

import { MessageSquareHeart, Star } from 'lucide-react';

import { BrandKpiCardHeader } from '@/components/admin/BrandKpiIconBox';
import { KPI_LIGHT, brandKpiCardStyle } from '@/lib/dashboardTheme';

export type PlatformReviewsSummary = {
  avgRating: number | null;
  totalCount: number;
  distribution: Array<{ stars: 1 | 2 | 3 | 4 | 5; count: number }>;
  recentComments: Array<{ stars: number; comment: string; createdAt: string }>;
};

type Props = {
  data?: PlatformReviewsSummary;
  loading?: boolean;
  periodLabel: string;
};

function StarBar({
  stars,
  count,
  maxCount,
  loading,
}: {
  stars: number;
  count: number;
  maxCount: number;
  loading?: boolean;
}) {
  const width = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-semibold tabular-nums text-fg">{stars} ★</span>
        <span className="text-[10px] tabular-nums text-muted">{loading ? '…' : count}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-navy-light/40">
        <div
          className="h-full rounded-full bg-amber-400 transition-all duration-300"
          style={{ width: loading ? '0%' : `${width}%` }}
        />
      </div>
    </div>
  );
}

export default function PlatformReviewsSummaryCard({ data, loading = false, periodLabel }: Props) {
  const theme = KPI_LIGHT.green;
  const maxCount = Math.max(...(data?.distribution.map((row) => row.count) ?? [0]), 1);
  const distribution =
    data?.distribution ??
    ([5, 4, 3, 2, 1] as const).map((stars) => ({ stars, count: 0 }));

  return (
    <div
      className="brand-kpi-card flex h-full flex-col overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-0.5"
      style={brandKpiCardStyle(theme)}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border/40 px-5 py-4">
        <BrandKpiCardHeader
          icon={MessageSquareHeart}
          theme={theme}
          title="Platform Customer Reviews"
          subtitle={periodLabel}
          size="sm"
          accentTitle={false}
          titleClassName="text-sm font-semibold text-fg"
        />
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-1">
            <Star size={16} className="fill-amber-400 text-amber-400" stroke="currentColor" />
            <span className="text-xl font-bold tabular-nums text-fg">
              {loading ? '…' : data?.avgRating != null ? data.avgRating.toFixed(1) : '—'}
            </span>
          </div>
          <p className="text-[10px] text-muted">
            {loading ? '…' : `${data?.totalCount ?? 0} review${data?.totalCount === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 content-start gap-x-4 gap-y-2 p-5">
        {distribution.map((row) => (
          <StarBar
            key={row.stars}
            stars={row.stars}
            count={row.count}
            maxCount={maxCount}
            loading={loading}
          />
        ))}
        {!loading && (data?.totalCount ?? 0) === 0 && (
          <p className="col-span-2 text-xs text-muted">No reviews in this period</p>
        )}
      </div>
    </div>
  );
}
