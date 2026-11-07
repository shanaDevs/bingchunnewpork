'use client';

import { cn } from '@/lib/utils';

const PEAK_BAR_HEIGHTS = [38, 52, 44, 70, 58, 82, 64, 48, 76, 55, 42, 60, 50, 36, 45] as const;

export function DashSkel({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="skeleton"
      className={cn('branch-dash-skel inline-block align-middle', className)}
      {...props}
    />
  );
}

export function ChartBarsSkeleton({ minHeight }: { minHeight: number }) {
  return (
    <div
      className="flex h-full items-end justify-between gap-1 px-1 pb-1 pt-4"
      style={{ minHeight }}
      aria-hidden
    >
      {PEAK_BAR_HEIGHTS.map((height, index) => (
        <DashSkel
          key={index}
          className="w-full min-w-0 rounded-t-md rounded-b-sm"
          style={{ height: Math.round((minHeight * height) / 100) }}
        />
      ))}
    </div>
  );
}

export function ChartAreaSkeleton({ height }: { height: number }) {
  return (
    <div className="relative w-full overflow-hidden rounded-md" style={{ height }} aria-hidden>
      <DashSkel className="absolute inset-0 block rounded-md" />
      <div className="branch-dash-skel-wave" />
    </div>
  );
}

export function OrderBreakdownSkeleton({ rows }: { rows: number }) {
  return (
    <>
      <DashSkel
        className="mx-auto block shrink-0 rounded-full"
        style={{ width: 168, height: 168 }}
      />
      <ul className="branch-dash-orders__legend">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="branch-dash-orders__legend-item">
            <DashSkel className="h-2 w-2 shrink-0 rounded-full" />
            <DashSkel className="h-3 w-[7.5rem] max-w-full" />
          </li>
        ))}
      </ul>
    </>
  );
}

export function DonutLegendSkeleton({
  rows,
  size = 168,
  minHeight,
}: {
  rows: number;
  size?: number;
  minHeight?: number;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center"
      style={minHeight ? { minHeight } : undefined}
      aria-hidden
    >
      <DashSkel className="block shrink-0 rounded-full" style={{ width: size, height: size }} />
      <ul className="flex w-full min-w-0 flex-1 flex-col gap-2">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="flex items-center gap-2">
            <DashSkel className="h-2 w-2 shrink-0 rounded-full" />
            <DashSkel className="h-3 w-[7.5rem] max-w-[45%]" />
            <DashSkel className="ml-auto h-3 w-16" />
            <DashSkel className="h-3 w-8" />
          </li>
        ))}
      </ul>
    </div>
  );
}
