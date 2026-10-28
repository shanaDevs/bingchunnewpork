import type { AdminPromoRow } from '@/lib/promotionFormUtils';

export function promoStatusLabel(promo: Pick<AdminPromoRow, 'isActive' | 'startsAt'>): 'Active' | 'Inactive' | 'Scheduled' {
  if (!promo.isActive) return 'Inactive';
  if (promo.startsAt && new Date(promo.startsAt) > new Date()) return 'Scheduled';
  return 'Active';
}
