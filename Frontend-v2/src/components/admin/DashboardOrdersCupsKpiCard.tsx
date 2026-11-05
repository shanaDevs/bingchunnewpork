'use client';

import Link from 'next/link';
import { Coffee, ShoppingBag } from 'lucide-react';

import { BrandKpiCardHeader } from '@/components/admin/BrandKpiIconBox';
import { KPI_LIGHT, brandKpiCardStyle } from '@/lib/dashboardTheme';

type Props = {
  ordersLabel: string;
  cupsLabel: string;
  orders?: number;
  cups?: number;
  loading?: boolean;
  href?: string;
  /** Neutral card surface without accent tint (branch admin dashboard). */
  plain?: boolean;
};

export default function DashboardOrdersCupsKpiCard({
  ordersLabel,
  cupsLabel,
  orders,
  cups,
  loading,
  href,
  plain = false,
}: Props) {
  const cells = [
    {
      label: ordersLabel,
      value: orders,
      icon: ShoppingBag,
      theme: KPI_LIGHT.blue,
      format: (value: number | undefined) => (value != null ? String(value) : '—'),
    },
    {
      label: cupsLabel,
      value: cups,
      icon: Coffee,
      theme: KPI_LIGHT.orange,
      format: (value: number | undefined) =>
        value != null && value > 0 ? value.toLocaleString() : value === 0 ? '0' : '—',
    },
  ] as const;

  const content = (
    <div
      className={`brand-kpi-card flex h-full min-h-[6.5rem] overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-0.5${plain ? ' brand-kpi-card--plain' : ''}`}
      style={plain ? undefined : brandKpiCardStyle(KPI_LIGHT.blue)}
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
