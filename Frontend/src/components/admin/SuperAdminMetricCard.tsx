'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

import { BrandKpiCardHeader } from '@/components/admin/BrandKpiIconBox';
import { KPI_LIGHT, brandKpiCardStyle, type KpiLightTheme } from '@/lib/dashboardTheme';

type Props = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  theme: KpiLightTheme;
  loading?: boolean;
  href?: string;
  footer?: React.ReactNode;
  subtitle?: string;
};

export default function SuperAdminMetricCard({
  label,
  value,
  icon,
  theme,
  loading,
  href,
  footer,
  subtitle,
}: Props) {
  const content = (
    <div
      className="brand-kpi-card flex h-full min-h-[7.5rem] flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5"
      style={brandKpiCardStyle(theme)}
    >
      <BrandKpiCardHeader icon={icon} theme={theme} title={label} size="sm" />
      <div className="mt-2">
        <p className="text-[clamp(1.125rem,1.6vw,1.5rem)] font-bold leading-none tracking-tight tabular-nums text-fg">
          {loading ? '…' : value}
        </p>
        {subtitle && (
          <p className="mt-1.5 text-xs font-medium" style={{ color: theme.chipFg }}>
            {loading ? '…' : subtitle}
          </p>
        )}
      </div>
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );

  // Footer links must not sit inside a card-level link (invalid nested <a>).
  if (href && !footer) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }

  return content;
}

export { KPI_LIGHT };
