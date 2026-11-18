import type { LucideIcon } from 'lucide-react';
import { Award, Crown, Flame, Sparkles } from 'lucide-react';

export type MenuCardTag = 'best-seller' | 'popular' | 'new' | 'classic';

export function mapProductTag(tag?: string | null): MenuCardTag | null {
  if (!tag) return null;
  const t = tag.toLowerCase();
  if (t.includes('best') || t === 'best seller') return 'best-seller';
  if (t === 'popular' || t === 'signature') return 'popular';
  if (t === 'new') return 'new';
  if (t === 'classic') return 'classic';
  return null;
}

export const tagStyles: Record<MenuCardTag, { className: string; icon: LucideIcon; label: string }> = {
  'best-seller': { className: 'bg-sun-400 text-brand-950', icon: Crown, label: 'Best Seller' },
  popular: { className: 'bg-rose-500 text-snow', icon: Flame, label: 'Popular' },
  new: { className: 'bg-emerald-500 text-snow', icon: Sparkles, label: 'New' },
  classic: { className: 'bg-amber-700 text-snow', icon: Award, label: 'Classic' },
};

/** Relative height on card stage (API has no cup size). */
export function productStageScale(): number {
  return 0.88;
}
