'use client';

import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';

type Props = {
  headers: [string, string, string];
  rows: Array<{ key: string; label: string; value: string }>;
  empty: string;
  loading?: boolean;
};

function BrandRankTableSkeleton() {
  return (
    <table className="w-full text-left text-xs" aria-hidden>
      <thead>
        <tr className="bg-slate-50 text-[11px] font-semibold text-muted">
          <th className="w-8 py-2 pl-2 font-semibold">{/* rank */}</th>
          <th className="py-2 pr-2 font-semibold">{/* name */}</th>
          <th className="py-2 pr-2 text-right font-semibold">{/* value */}</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 5 }).map((_, index) => (
          <tr key={index} className="border-b border-[#e2e8f0]/80 last:border-0">
            <td className="w-8 py-2 pl-2">
              <DashSkel className="h-3 w-3" />
            </td>
            <td className="py-2 pr-2">
              <DashSkel className="h-3.5 w-36 max-w-full" />
            </td>
            <td className="py-2 pr-2 text-right">
              <DashSkel className="ml-auto h-3.5 w-16" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BrandRankTable({ headers, rows, empty, loading }: Props) {
  if (loading) {
    return <BrandRankTableSkeleton />;
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-xs text-muted">{empty}</p>;
  }

  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="bg-slate-50 text-[11px] font-semibold text-muted">
          <th className="w-8 py-2 pl-2 font-semibold">{headers[0]}</th>
          <th className="py-2 pr-2 font-semibold">{headers[1]}</th>
          <th className="py-2 pr-2 text-right font-semibold">{headers[2]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.key} className="border-b border-[#e2e8f0]/80 last:border-0">
            <td className="w-8 py-2 pl-2 font-semibold tabular-nums text-fg">{index + 1}</td>
            <td className="max-w-0 truncate py-2 pr-2 font-medium text-fg" title={row.label}>
              {row.label}
            </td>
            <td className="whitespace-nowrap py-2 pr-2 text-right font-semibold tabular-nums text-fg">
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
