'use client';

import Link from 'next/link';
import { Heart, UserPlus } from 'lucide-react';

import { BrandKpiCardHeader } from '@/components/admin/BrandKpiIconBox';
import { KPI_LIGHT, brandKpiCardStyle } from '@/lib/dashboardTheme';

type Props = {
  newCustomers?: number;
  loyalCustomers?: number;
  loading?: boolean;
  href?: string;
};

export default function DashboardCustomersKpiCard({
  newCustomers,
  loyalCustomers,
  loading,
  href,
}: Props) {
  const cells = [
    {
      label: 'New Customers',
      value: newCustomers,
      icon: UserPlus,
      theme: KPI_LIGHT.indigo,
      format: (value: number | undefined) => (value != null ? String(value) : '—'),
    },
    {
      label: 'Loyal Customers',
      value: loyalCustomers,
      icon: Heart,
      theme: KPI_LIGHT.purple,
      format: (value: number | undefined) => (value != null ? String(value) : '—'),
    },
  ] as const;

  const content = (
    <div
      className="brand-kpi-card flex h-full min-h-[6.5rem] overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-0.5"
      style={brandKpiCardStyle(KPI_LIGHT.indigo)}
    >
      {cells.map((cell, index) => {
        const Icon = cell.icon;
        return (
          <div
            key={cell.label}
            className={`flex min-w-0 flex-1 flex-col p-3 ${index === 0 ? 'border-r border-border/40' : ''}`}
          >
            <BrandKpiCardHeader icon={Icon} theme={cell.theme} title={cell.label} size="sm" />
            <p className="mt-auto pt-1.5 text-[clamp(0.9375rem,1.3vw,1.25rem)] font-bold leading-none tracking-tight tabular-nums text-fg">
              {loading ? '…' : cell.format(cell.value)}
            </p>
          </div>
        );
      })}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }

  return content;
}
