'use client';

import type { LucideIcon } from 'lucide-react';

import { BrandCommandKpiCardSkeleton } from '@/components/admin/brand-sales/BrandSalesDashboardSkeleton';

type Props = {
  icon: LucideIcon;
  title: string;
  value: string;
  changePercent?: number;
  loading?: boolean;
};

export default function BrandCommandKpiCard({
  icon: Icon,
  title,
  value,
  changePercent,
  loading,
}: Props) {
  if (loading) {
    return <BrandCommandKpiCardSkeleton />;
  }

  const showChange = changePercent != null;
  const positive = (changePercent ?? 0) >= 0;

  return (
    <div className="card flex h-full min-h-[92px] flex-col justify-between p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium text-muted">{title}</p>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#307ef2]/10 text-[#307ef2]">
          <Icon size={14} strokeWidth={2.25} />
        </span>
      </div>
      <div>
        <p className="text-xl font-bold leading-none tabular-nums text-fg lg:text-[1.35rem]">{value}</p>
        {showChange ? (
          <p className={`mt-1.5 text-[11px] font-semibold tabular-nums ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
            {`${positive ? '+' : ''}${changePercent}% vs previous period`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
