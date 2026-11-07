'use client';

import type { ReactNode } from 'react';

type Props = {
  title: string;
  branchControl: ReactNode;
  tabs: ReactNode;
  footerLink?: ReactNode;
  children: ReactNode;
};

export default function BrandRankLeaderboardCard({
  title,
  branchControl,
  tabs,
  footerLink,
  children,
}: Props) {
  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <h2 className="min-w-0 truncate text-sm font-semibold text-fg">{title}</h2>
        <div className="shrink-0">{branchControl}</div>
      </div>
      <div className="px-4 pb-3">{tabs}</div>
      <div className="min-h-0 flex-1 px-4">{children}</div>
      {footerLink ? <div className="mt-auto px-4 pb-4 pt-2">{footerLink}</div> : null}
    </div>
  );
}
