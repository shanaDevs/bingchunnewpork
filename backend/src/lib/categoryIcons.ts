/** Canonical category icons by slug (UTF-8). Overrides corrupted DB values in API responses. */
export const CATEGORY_ICON_BY_SLUG: Record<string, string> = {
  'bubble-tea': '🧋',
  'milk-tea': '🍵',
  'fruit-tea': '🍋',
  milkshake: '🥤',
  sundae: '🍨',
  'ice-cream': '🍦',
};

export function resolveCategoryIcon(slug: string, storedIcon?: string | null): string | null {
  return CATEGORY_ICON_BY_SLUG[slug] ?? storedIcon ?? null;
}
