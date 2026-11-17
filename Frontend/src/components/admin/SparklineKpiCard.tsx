'use client';

import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';

export type SparklineKpiTone = 'blue' | 'green' | 'orange' | 'purple' | 'red';

const TONE_STYLES: Record<
  SparklineKpiTone,
  { iconWrap: string; icon: string; spark: string; fill: string }
> = {
  blue: {
    iconWrap: 'bg-brand/10',
    icon: 'text-brand',
    spark: '#307ef2',
    fill: 'rgba(48, 126, 242, 0.18)',
  },
  green: {
    iconWrap: 'bg-emerald-500/10',
    icon: 'text-emerald-500',
    spark: '#22c55e',
    fill: 'rgba(34, 197, 94, 0.18)',
  },
  orange: {
    iconWrap: 'bg-amber-500/10',
    icon: 'text-amber-500',
    spark: '#f59e0b',
    fill: 'rgba(245, 158, 11, 0.18)',
  },
  purple: {
    iconWrap: 'bg-violet-500/10',
    icon: 'text-violet-500',
    spark: '#a855f7',
    fill: 'rgba(168, 85, 247, 0.18)',
  },
  red: {
    iconWrap: 'bg-red-500/10',
    icon: 'text-red-500',
    spark: '#ef4444',
    fill: 'rgba(239, 68, 68, 0.18)',
  },
};

function Sparkline({ values, stroke, fill }: { values: number[]; stroke: string; fill: string }) {
  const width = 88;
  const height = 36;
  const pad = 2;
  const series = values.length > 0 ? values : [0, 0];
  const min = Math.min(...series, 0);
  const max = Math.max(...series, 1);
  const span = max - min || 1;

  const points = series.map((value, index) => {
    const x =
      series.length === 1
        ? width / 2
        : pad + (index / (series.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });

  const polyline = points.join(' ');
  const area = `0,${height} ${polyline} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-[5.5rem]" aria-hidden>
      <polygon points={area} fill={fill} />
      <polyline
        points={polyline}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  label: string;
  value: string;
  icon: LucideIcon;
  loading?: boolean;
  series?: number[];
  changePercent?: number | null;
  changeLabel?: string;
  tone?: SparklineKpiTone;
  className?: string;
};

export default function SparklineKpiCard({
  label,
  value,
  icon: Icon,
  loading = false,
  series,
  changePercent,
  changeLabel = 'vs last month',
  tone = 'blue',
  className,
}: Props) {
  const styles = TONE_STYLES[tone];
  const delta = changePercent ?? null;
  const deltaUp = delta != null && delta > 0;
  const deltaDown = delta != null && delta < 0;

  return (
    <div
      className={cn(
        'card flex min-h-[7.25rem] min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2.5">
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                styles.iconWrap,
              )}
            >
              <Icon size={16} className={styles.icon} strokeWidth={2.2} />
            </div>
            <p className="truncate text-xs font-medium text-muted">{label}</p>
          </div>
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded-lg bg-white/5" />
          ) : (
            <p className="truncate text-xl font-bold tabular-nums leading-tight text-fg sm:text-2xl">
              {value}
            </p>
          )}
        </div>
        <div className="mt-1 shrink-0">
          <Sparkline
            values={series && series.length > 0 ? series : [1, 2, 1.6, 2.8, 2.2, 3.4, 2.6]}
            stroke={styles.spark}
            fill={styles.fill}
          />
        </div>
      </div>

      {changePercent !== undefined ? (
        delta != null && !loading ? (
          <p
            className={cn(
              'mt-3 flex items-center gap-1 text-[11px] font-medium',
              deltaUp ? 'text-emerald-500' : deltaDown ? 'text-red-500' : 'text-muted',
            )}
          >
            {deltaUp ? (
              <TrendingUp size={12} />
            ) : deltaDown ? (
              <TrendingDown size={12} />
            ) : null}
            <span className="tabular-nums">
              {delta > 0 ? '+' : ''}
              {delta}%
            </span>
            <span className="font-normal text-muted">{changeLabel}</span>
          </p>
        ) : (
          <p className="mt-3 text-[11px] text-muted">&nbsp;</p>
        )
      ) : null}
    </div>
  );
}
