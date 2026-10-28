'use client';

import RankMedalBadge from '@/components/admin/RankMedalBadge';

type Props = {
  rank: number;
  name: string;
  value: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function DashboardTopCustomerCard({ rank, name, value }: Props) {
  return (
    <li className="flex list-none items-center gap-3 border-b border-navy-border/50 py-3 last:border-b-0">
      <RankMedalBadge rank={rank} className="shrink-0 scale-[0.72] origin-left" />
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/20 to-brand/5 text-xs font-bold text-brand ring-2 ring-brand/20"
        aria-hidden
      >
        {initials(name) || '?'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg" title={name}>
          {name}
        </p>
        <p className="mt-0.5 text-sm font-bold tabular-nums text-brand">{value}</p>
      </div>
    </li>
  );
}
