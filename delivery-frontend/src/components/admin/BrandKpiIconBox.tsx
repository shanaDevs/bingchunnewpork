'use client';

import type { LucideIcon } from 'lucide-react';

import type { KpiLightTheme } from '@/lib/dashboardTheme';

type Props = {
  icon: LucideIcon;
  theme: KpiLightTheme;
  size?: 'sm' | 'md';
};

const BOX = {
  sm: 'h-9 w-9 rounded-xl',
  md: 'h-10 w-10 rounded-xl',
} as const;

const ICON_SIZE = { sm: 16, md: 18 } as const;

export default function BrandKpiIconBox({ icon: Icon, theme, size = 'md' }: Props) {
  return (
    <div
      className={`brand-kpi-icon flex shrink-0 items-center justify-center ${BOX[size]}`}
      style={{
        background: theme.iconGradient,
        boxShadow: theme.iconShadow,
      }}
    >
      <Icon
        size={ICON_SIZE[size]}
        className="brand-kpi-icon__glyph shrink-0"
        strokeWidth={2.25}
        color="#ffffff"
        aria-hidden
      />
    </div>
  );
}

type HeaderProps = {
  icon: LucideIcon;
  theme: KpiLightTheme;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md';
  titleClassName?: string;
  className?: string;
  /** When false, title uses className color only (e.g. text-fg). Default true = accent chip color. */
  accentTitle?: boolean;
};

export function BrandKpiCardHeader({
  icon,
  theme,
  title,
  subtitle,
  size = 'md',
  titleClassName = 'text-xs font-semibold leading-tight',
  className = '',
  accentTitle = true,
}: HeaderProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <BrandKpiIconBox icon={icon} theme={theme} size={size} />
      <div className="min-w-0 flex-1">
        <p
          className={titleClassName}
          style={accentTitle ? { color: theme.chipFg } : undefined}
        >
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-[11px] leading-tight" style={{ color: theme.chipFg, opacity: 0.85 }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
