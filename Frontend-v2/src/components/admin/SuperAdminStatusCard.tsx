'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

import { BrandKpiCardHeader } from '@/components/admin/BrandKpiIconBox';
import { brandKpiCardStyle, type KpiLightTheme } from '@/lib/dashboardTheme';

type Props = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  theme: KpiLightTheme;
  loading?: boolean;
  href?: string;
  hint?: string;
  mascotSrc: string;
  /** Neutral card surface without accent tint. */
  plain?: boolean;
};

export default function SuperAdminStatusCard({
  label,
  value,
  icon,
  theme,
  loading,
  href,
  hint,
  mascotSrc,
  plain = false,
}: Props) {
  const inner = (
    <div
      className={`brand-kpi-card relative flex h-full min-h-[7rem] flex-col overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5${plain ? ' brand-kpi-card--plain' : ''}`}
      style={plain ? undefined : brandKpiCardStyle(theme)}
    >
      <BrandKpiCardHeader icon={icon} theme={theme} title={label} size="sm" />
      <p className="mt-2 text-[clamp(1.25rem,1.8vw,1.75rem)] font-bold leading-none tabular-nums text-fg">
        {loading ? '…' : value}
      </p>
      {hint && (
        <p className="mt-1 text-xs font-medium" style={{ color: theme.chipFg }}>
          {loading ? '…' : hint}
        </p>
      )}
      {href && (
        <span
          className="mt-auto inline-flex items-center gap-0.5 pt-2 text-xs font-semibold"
          style={{ color: theme.chipFg }}
        >
          View details
          <ChevronRight size={14} />
        </span>
      )}
      <div className="pointer-events-none absolute bottom-0 right-1 h-20 w-20 sm:h-[5.5rem] sm:w-[5.5rem]">
        <Image src={mascotSrc} alt="" fill className="object-contain object-bottom" sizes="88px" />
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    );
  }

  return inner;
}
