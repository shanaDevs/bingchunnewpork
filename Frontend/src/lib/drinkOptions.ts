/** Ice / sugar customization for drinks (not ice cream or sundaes). */

export const SUGAR_LEVELS = ['FIFTY', 'HUNDRED'] as const;
export const ICE_LEVELS = ['LESS_ICE', 'NORMAL_ICE'] as const;

export type SugarLevel = (typeof SUGAR_LEVELS)[number];
export type IceLevel = (typeof ICE_LEVELS)[number];

export const DEFAULT_SUGAR_LEVEL: SugarLevel = 'HUNDRED';
export const DEFAULT_ICE_LEVEL: IceLevel = 'NORMAL_ICE';

/** Categories that do not take ice/sugar customization. */
const NO_DRINK_OPTIONS = new Set(['ice-cream', 'sundae', 'icecream']);

export const SUGAR_LEVEL_LABELS: Record<SugarLevel, string> = {
  FIFTY: '50% Sugar',
  HUNDRED: '100% Sugar',
};

export const ICE_LEVEL_LABELS: Record<IceLevel, string> = {
  LESS_ICE: 'Less Ice',
  NORMAL_ICE: 'Normal Ice',
};

function looksLikeFrozenDessert(text: string): boolean {
  const value = text.trim().toLowerCase();
  if (!value) return false;
  if (NO_DRINK_OPTIONS.has(value)) return true;
  return (
    value.includes('ice cream') ||
    value.includes('ice-cream') ||
    value.includes('icecream') ||
    value.includes('sundae')
  );
}

/**
 * Show ice/sugar for every drink. Independent of toppings.
 * Only ice cream / sundae products are excluded.
 */
export function productNeedsDrinkOptions(product: {
  name?: string | null;
  category?: { slug?: string | null; name?: string | null } | null;
}): boolean {
  const slug = product.category?.slug?.trim().toLowerCase() ?? '';
  const categoryName = product.category?.name?.trim() ?? '';
  const productName = product.name?.trim() ?? '';

  if (looksLikeFrozenDessert(slug) || looksLikeFrozenDessert(categoryName)) {
    return false;
  }
  if (!slug && !categoryName) {
    return !looksLikeFrozenDessert(productName);
  }
  return true;
}

/** Map legacy cart/API values onto the current two-option sets. */
export function normalizeSugarLevel(level: string | null | undefined): SugarLevel | null {
  if (!level) return null;
  if (level === 'FIFTY' || level === 'LESS_SUGAR' || level === 'TWENTY_FIVE' || level === 'ZERO') {
    return 'FIFTY';
  }
  if (
    level === 'HUNDRED' ||
    level === 'NORMAL_SUGAR' ||
    level === 'MORE_SUGAR' ||
    level === 'SEVENTY_FIVE'
  ) {
    return 'HUNDRED';
  }
  return SUGAR_LEVELS.includes(level as SugarLevel) ? (level as SugarLevel) : null;
}

export function normalizeIceLevel(level: string | null | undefined): IceLevel | null {
  if (!level) return null;
  if (level === 'LESS_ICE' || level === 'NO_ICE') return 'LESS_ICE';
  if (level === 'NORMAL_ICE' || level === 'MORE_ICE' || level === 'REGULAR') return 'NORMAL_ICE';
  return ICE_LEVELS.includes(level as IceLevel) ? (level as IceLevel) : null;
}

export function sugarLevelLabel(level: string | null | undefined): string | null {
  const normalized = normalizeSugarLevel(level);
  return normalized ? SUGAR_LEVEL_LABELS[normalized] : null;
}

export function iceLevelLabel(level: string | null | undefined): string | null {
  const normalized = normalizeIceLevel(level);
  return normalized ? ICE_LEVEL_LABELS[normalized] : null;
}

/** Compact line for cart / receipt / stickers, e.g. "Less Ice · 100% Sugar". */
export function formatDrinkOptionLine(input: {
  iceLevel?: string | null;
  sugarLevel?: string | null;
}): string | null {
  const parts = [iceLevelLabel(input.iceLevel), sugarLevelLabel(input.sugarLevel)].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}