'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Props = {
  children: ReactNode;
  className?: string;
};

export default function BrandedChartTooltipShell({ children, className }: Props) {
  return (
    <div
      className={cn(
        'relative grid min-w-32 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 pt-2 pr-7 text-xs shadow-xl',
        className,
      )}
    >
      <div
        className="brand-tooltip-logo-pulse pointer-events-none absolute -right-4 -top-4 z-10 drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)]"
        aria-hidden
      >
        <div className="relative h-9 w-9 overflow-hidden rounded-full bg-background ring-2 ring-background">
          <Image
            src="/brand/logo.avif"
            alt=""
            width={36}
            height={36}
            className="h-full w-full object-contain p-0.5"
          />
        </div>
      </div>
      {children}
    </div>
  );
}
