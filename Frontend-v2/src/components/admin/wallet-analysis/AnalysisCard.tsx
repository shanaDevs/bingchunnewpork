'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
  minHeightClassName?: string;
};

/** Shared shell for wallet-analysis KPI / chart panels. */
export default function AnalysisCard({
  title,
  subtitle,
  children,
  className,
  headerRight,
  minHeightClassName = 'min-h-[230px] lg:min-h-0',
}: Props) {
  return (
    <div
      className={cn(
        'super-admin-overview-card card flex h-full min-h-0 flex-col p-3.5',
        minHeightClassName,
        className,
      )}
    >
      <div
        className={cn(
          'mb-2 shrink-0',
          headerRight ? 'flex items-start justify-between gap-2' : undefined,
        )}
      >
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold leading-none text-fg">{title}</h3>
          {subtitle ? (
            <p className="mt-1 text-[11px] leading-none text-muted">{subtitle}</p>
          ) : null}
        </div>
        {headerRight}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
