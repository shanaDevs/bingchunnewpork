/** Dashboard metric cards — medium saturation, colorful but not heavy. */
export const KPI_BOLD = {
  blue: {
    bg: 'linear-gradient(145deg, #4d88eb 0%, #3270d9 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    iconColor: '#ffffff',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    fg: '#ffffff',
    label: 'rgba(255, 255, 255, 0.94)',
    muted: 'rgba(255, 255, 255, 0.86)',
  },
  navy: {
    bg: 'linear-gradient(145deg, #1e4a8a 0%, #153563 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    iconColor: '#ffffff',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    fg: '#ffffff',
    label: 'rgba(255, 255, 255, 0.94)',
    muted: 'rgba(255, 255, 255, 0.86)',
  },
  red: {
    bg: 'linear-gradient(145deg, #ef5268 0%, #d93652 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    iconColor: '#ffffff',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    fg: '#ffffff',
    label: 'rgba(255, 255, 255, 0.94)',
    muted: 'rgba(255, 255, 255, 0.86)',
  },
  green: {
    bg: 'linear-gradient(145deg, #3ecf7a 0%, #22b564 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    iconColor: '#ffffff',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    fg: '#ffffff',
    label: 'rgba(255, 255, 255, 0.94)',
    muted: 'rgba(255, 255, 255, 0.86)',
  },
  greenDark: {
    bg: 'linear-gradient(145deg, #1f8f52 0%, #146b3d 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    iconColor: '#ffffff',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    fg: '#ffffff',
    label: 'rgba(255, 255, 255, 0.94)',
    muted: 'rgba(255, 255, 255, 0.86)',
  },
  purple: {
    bg: 'linear-gradient(145deg, #9163e8 0%, #7548d4 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    iconColor: '#ffffff',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    fg: '#ffffff',
    label: 'rgba(255, 255, 255, 0.94)',
    muted: 'rgba(255, 255, 255, 0.86)',
  },
  orange: {
    bg: 'linear-gradient(145deg, #f59e42 0%, #e07c12 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    iconColor: '#ffffff',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    fg: '#ffffff',
    label: 'rgba(255, 255, 255, 0.94)',
    muted: 'rgba(255, 255, 255, 0.86)',
  },
  cyan: {
    bg: 'linear-gradient(145deg, #22bdd6 0%, #0e9cb5 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)',
    iconColor: '#ffffff',
    badgeBg: 'rgba(255, 255, 255, 0.22)',
    fg: '#ffffff',
    label: 'rgba(255, 255, 255, 0.94)',
    muted: 'rgba(255, 255, 255, 0.86)',
  },
} as const;

export type DashKpiTone = keyof typeof KPI_BOLD;

const KPI_CARD_BASE = { light: '#ffffff', dark: '#151b32' } as const;

/** Tint overlay + solid base for brand KPI cards. */
function kpiCardSurface(r: number, g: number, b: number) {
  return {
    cardBg: `linear-gradient(155deg, rgba(${r}, ${g}, ${b}, 0.14) 0%, rgba(${r}, ${g}, ${b}, 0.06) 100%), ${KPI_CARD_BASE.light}`,
    cardBgDark: `linear-gradient(155deg, rgba(${r}, ${g}, ${b}, 0.22) 0%, rgba(${r}, ${g}, ${b}, 0.1) 100%), ${KPI_CARD_BASE.dark}`,
    borderTint: `rgba(${r}, ${g}, ${b}, 0.38)`,
    borderTintDark: `rgba(${r}, ${g}, ${b}, 0.45)`,
    iconShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 -2px 0 rgba(0, 0, 0, 0.14), 0 3px 0 rgba(${r}, ${g}, ${b}, 0.4), 0 6px 14px rgba(${r}, ${g}, ${b}, 0.28)`,
  };
}

/** Light-surface KPI cards — tinted card + accent icon (brand sales). */
export const KPI_LIGHT = {
  blue: {
    accent: '#3b82f6',
    iconGradient: 'linear-gradient(145deg, #60a5fa 0%, #3b82f6 100%)',
    chipBg: 'rgba(59, 130, 246, 0.12)',
    chipFg: '#2563eb',
    rowBg: 'rgba(59, 130, 246, 0.1)',
    footerBg: 'rgba(59, 130, 246, 0.12)',
    ...kpiCardSurface(59, 130, 246),
  },
  navy: {
    accent: '#1e40af',
    iconGradient: 'linear-gradient(145deg, #3b5cb8 0%, #1e3a8a 100%)',
    chipBg: 'rgba(30, 64, 175, 0.12)',
    chipFg: '#1d4ed8',
    rowBg: 'rgba(30, 64, 175, 0.1)',
    footerBg: 'rgba(30, 64, 175, 0.12)',
    ...kpiCardSurface(30, 64, 175),
  },
  green: {
    accent: '#10b981',
    iconGradient: 'linear-gradient(145deg, #34d399 0%, #10b981 100%)',
    chipBg: 'rgba(16, 185, 129, 0.12)',
    chipFg: '#059669',
    rowBg: 'rgba(16, 185, 129, 0.1)',
    footerBg: 'rgba(16, 185, 129, 0.12)',
    ...kpiCardSurface(16, 185, 129),
  },
  orange: {
    accent: '#f59e0b',
    iconGradient: 'linear-gradient(145deg, #fbbf24 0%, #f59e0b 100%)',
    chipBg: 'rgba(245, 158, 11, 0.14)',
    chipFg: '#d97706',
    rowBg: 'rgba(245, 158, 11, 0.11)',
    footerBg: 'rgba(245, 158, 11, 0.13)',
    ...kpiCardSurface(245, 158, 11),
  },
  purple: {
    accent: '#8b5cf6',
    iconGradient: 'linear-gradient(145deg, #a78bfa 0%, #8b5cf6 100%)',
    chipBg: 'rgba(139, 92, 246, 0.12)',
    chipFg: '#7c3aed',
    rowBg: 'rgba(139, 92, 246, 0.1)',
    footerBg: 'rgba(139, 92, 246, 0.12)',
    ...kpiCardSurface(139, 92, 246),
  },
  cyan: {
    accent: '#06b6d4',
    iconGradient: 'linear-gradient(145deg, #22d3ee 0%, #06b6d4 100%)',
    chipBg: 'rgba(6, 182, 212, 0.12)',
    chipFg: '#0891b2',
    rowBg: 'rgba(6, 182, 212, 0.1)',
    footerBg: 'rgba(6, 182, 212, 0.12)',
    ...kpiCardSurface(6, 182, 212),
  },
  indigo: {
    accent: '#6366f1',
    iconGradient: 'linear-gradient(145deg, #818cf8 0%, #6366f1 100%)',
    chipBg: 'rgba(99, 102, 241, 0.12)',
    chipFg: '#4f46e5',
    rowBg: 'rgba(99, 102, 241, 0.1)',
    footerBg: 'rgba(99, 102, 241, 0.12)',
    ...kpiCardSurface(99, 102, 241),
  },
  amber: {
    accent: '#f59e0b',
    iconGradient: 'linear-gradient(145deg, #fcd34d 0%, #f59e0b 100%)',
    chipBg: 'rgba(245, 158, 11, 0.14)',
    chipFg: '#d97706',
    rowBg: 'rgba(251, 191, 36, 0.12)',
    footerBg: 'rgba(245, 158, 11, 0.13)',
    ...kpiCardSurface(251, 191, 36),
  },
  pink: {
    accent: '#ec4899',
    iconGradient: 'linear-gradient(145deg, #f472b6 0%, #ec4899 100%)',
    chipBg: 'rgba(236, 72, 153, 0.12)',
    chipFg: '#db2777',
    rowBg: 'rgba(236, 72, 153, 0.1)',
    footerBg: 'rgba(236, 72, 153, 0.12)',
    ...kpiCardSurface(236, 72, 153),
  },
} as const;

export type DashKpiLightTone = keyof typeof KPI_LIGHT;

export type KpiLightTheme = (typeof KPI_LIGHT)[DashKpiLightTone];

/** Shared CSS variables for brand KPI cards (tint + border). */
export function brandKpiCardStyle(theme: KpiLightTheme) {
  return {
    ['--brand-kpi-bg-light' as string]: theme.cardBg,
    ['--brand-kpi-bg-dark' as string]: theme.cardBgDark,
    ['--brand-kpi-border-light' as string]: theme.borderTint,
    ['--brand-kpi-border-dark' as string]: theme.borderTintDark,
  };
}

export const DARK_KPI_COLORS: Record<DashKpiTone, string> = {
  blue: '#307ef2',
  navy: '#153563',
  red: '#ef4444',
  green: '#22c55e',
  greenDark: '#15803d',
  purple: '#a78bfa',
  orange: '#f59e0b',
  cyan: '#06b6d4',
};

/** Revenue hero banner */
export const REVENUE_HERO = {
  bg: 'linear-gradient(135deg, #2ec282 0%, #1aad72 52%, #149664 100%)',
  insetBg: 'rgba(0, 0, 0, 0.14)',
  iconBg: 'rgba(255, 255, 255, 0.2)',
  iconColor: '#ffffff',
  fg: '#ffffff',
  label: 'rgba(255, 255, 255, 0.94)',
  muted: 'rgba(255, 255, 255, 0.86)',
  accent: '#ffffff',
  divider: 'rgba(255, 255, 255, 0.14)',
};

/** Period filter pills */
export const PERIOD_FILTER = {
  activeBg: '#307ef2',
  activeFg: '#ffffff',
  inactiveBg: '#303641',
  inactiveFg: '#ffffff',
  inactiveFgMuted: '#ffffff',
};
