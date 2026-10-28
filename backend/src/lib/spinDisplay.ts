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

const CRITERION_SET = new Set<string>(SPIN_CRITERION_TYPES);

export function hasSpinCriterion(
  criteria: SpinCriterion[],
  type: SpinCriterionType,
): boolean {
  return criteria.some((c) => c.type === type);
}

export function parseSpinDisplay(raw: unknown): SpinDisplaySettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pages = src.popupPages;
  return {
    autoPopup: src.autoPopup !== false,
    showHeaderButton: src.showHeaderButton !== false,
    showFab: src.showFab !== false,
    popupPages:
      pages === 'HOME_AND_ORDER' || pages === 'ALL' || pages === 'HOME' ? pages : 'HOME',
    loseAutoHideSeconds: clampSeconds(src.loseAutoHideSeconds, 2.5),
  };
}

export function parseSpinCriteria(raw: unknown): SpinCriterion[] {
  if (!Array.isArray(raw)) return [];
  const out: SpinCriterion[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const type = typeof row.type === 'string' ? row.type : '';
    if (!CRITERION_SET.has(type) || seen.has(type)) continue;
    seen.add(type);
    const id =
      typeof row.id === 'string' && row.id.trim()
        ? row.id.trim().slice(0, 64)
        : `c_${type.toLowerCase()}`;
    const value = parseOptionalNumber(row.value);
    out.push({
      id,
      type: type as SpinCriterionType,
      ...(value != null ? { value } : {}),
    });
  }
  return out;
}

function clampSeconds(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(30, Math.max(0, Math.round(n * 10) / 10));
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(1_000_000, Math.max(0, Math.round(n)));
}
