/** Slug → display icon. Prefer this map over API `icon` (DB values are often mojibake). */
export const CATEGORY_EMOJI: Record<string, string> = {
  all: '✨',
  'bubble-tea': '🧋',
  'milk-tea': '🍵',
  'fruit-tea': '🍋',
  milkshake: '🥤',
  sundae: '🍨',
  'ice-cream': '🍦',
};

export function getCategoryEmoji(slug: string, apiIcon?: string | null): string {
  return CATEGORY_EMOJI[slug] ?? apiIcon ?? '🥤';
}
