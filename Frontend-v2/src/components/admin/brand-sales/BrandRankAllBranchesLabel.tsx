'use client';

import { ChevronDown } from 'lucide-react';

export default function BrandRankAllBranchesLabel() {
  return (
    <span
      className="inline-flex min-w-0 max-w-[10rem] items-center justify-between gap-1.5 rounded-md border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-xs text-fg"
      aria-hidden
    >
      <span className="truncate">All Branches</span>
      <ChevronDown size={14} className="shrink-0 opacity-60" />
    </span>
  );
}
