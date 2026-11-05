export const SPIN_CRITERION_TYPES = [
  'REQUIRE_LOGIN',
  'FIRST_ORDER_ONLY',
  'RETURNING_CUSTOMERS',
  'LOYALTY_JOURNEY',
  'MIN_ORDERS',
  'MIN_SPEND',
] as const;

export type SpinCriterionType = (typeof SPIN_CRITERION_TYPES)[number];

export type SpinCriterion = {
  id: string;
  type: SpinCriterionType;
  value?: number;
};

export type SpinPopupPages = 'HOME' | 'HOME_AND_ORDER' | 'ALL';

export type SpinDisplaySettings = {
  autoPopup: boolean;
  showHeaderButton: boolean;
  showFab: boolean;
  popupPages: SpinPopupPages;
  loseAutoHideSeconds: number;
};

export const DEFAULT_SPIN_DISPLAY: SpinDisplaySettings = {
  autoPopup: true,
  showHeaderButton: true,
  showFab: true,
  popupPages: 'HOME',
  loseAutoHideSeconds: 2.5,
};

export const SPIN_CRITERION_OPTIONS: Array<{
  type: SpinCriterionType;
  label: string;
  hint: string;
  needsValue?: 'orders' | 'spend';
}> = [
  {
    type: 'REQUIRE_LOGIN',
    label: 'Require sign-in',
    hint: 'Guests cannot spin',
  },
  {
    type: 'FIRST_ORDER_ONLY',
    label: 'First order only',
    hint: 'Only customers with no prior orders',
  },
  {
    type: 'RETURNING_CUSTOMERS',
    label: 'Returning customers',
    hint: 'Must have placed at least one order',
  },
  {
    type: 'LOYALTY_JOURNEY',
    label: 'Loyalty journey unlock',
    hint: 'Wait until New customer journey Offer 3 is unlocked',
  },
  {
    type: 'MIN_ORDERS',
    label: 'Minimum completed orders',
    hint: 'Customer must have this many paid orders',
    needsValue: 'orders',
  },
  {
    type: 'MIN_SPEND',
    label: 'Minimum lifetime spend',
    hint: 'Total order subtotal in LKR',
    needsValue: 'spend',
  },
];

export function parseSpinDisplay(raw: unknown): SpinDisplaySettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pages = src.popupPages;
  return {
    autoPopup: src.autoPopup !== false,
    showHeaderButton: src.showHeaderButton !== false,
    showFab: src.showFab !== false,
    popupPages:
      pages === 'HOME_AND_ORDER' || pages === 'ALL' || pages === 'HOME' ? pages : 'HOME',
    loseAutoHideSeconds: (() => {
      const n = typeof src.loseAutoHideSeconds === 'number' ? src.loseAutoHideSeconds : Number(src.loseAutoHideSeconds);
      if (!Number.isFinite(n)) return DEFAULT_SPIN_DISPLAY.loseAutoHideSeconds;
      return Math.min(30, Math.max(0, Math.round(n * 10) / 10));
    })(),
  };
}

export function parseSpinCriteria(raw: unknown): SpinCriterion[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(SPIN_CRITERION_TYPES);
  const out: SpinCriterion[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const type = typeof row.type === 'string' ? row.type : '';
    if (!allowed.has(type) || seen.has(type)) continue;
    seen.add(type);
    const id =
      typeof row.id === 'string' && row.id.trim()
        ? row.id.trim()
        : `c_${type.toLowerCase()}`;
    const valueRaw = row.value;
    const value =
      valueRaw == null || valueRaw === ''
        ? undefined
        : Math.min(1_000_000, Math.max(0, Math.round(Number(valueRaw))));
    out.push({
      id,
      type: type as SpinCriterionType,
      ...(Number.isFinite(value) ? { value } : {}),
    });
  }
  return out;
}

export function newSpinCriterion(type: SpinCriterionType): SpinCriterion {
  const base: SpinCriterion = {
    id: `c_${type.toLowerCase()}_${Date.now().toString(36)}`,
    type,
  };
  if (type === 'MIN_ORDERS') return { ...base, value: 1 };
  if (type === 'MIN_SPEND') return { ...base, value: 1000 };
  return base;
}

export function isSpinPopupPath(
  pathname: string,
  pages: SpinPopupPages | undefined,
): boolean {
  if (pages === 'ALL') return true;
  if (pages === 'HOME_AND_ORDER') {
    return pathname === '/' || pathname.startsWith('/order/');
  }
  return pathname === '/';
}
