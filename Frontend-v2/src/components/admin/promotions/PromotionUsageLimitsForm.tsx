'use client';

import type { PromotionUsageLimits } from '@/lib/promotionTypes';

interface PromotionUsageLimitsFormProps {
  limits: PromotionUsageLimits;
  usedCount?: number;
  onChange: (limits: PromotionUsageLimits) => void;
}

export default function PromotionUsageLimitsForm({ limits, usedCount = 0, onChange }: PromotionUsageLimitsFormProps) {
  function set(field: keyof PromotionUsageLimits, value: string) {
    onChange({
      ...limits,
      [field]: value === '' ? undefined : Number(value),
    });
  }

  return (
    <div className="promo-usage-limits card p-4">
      <h4 className="text-sm font-bold text-white mb-4">Usage &amp; Limits</h4>

      {usedCount > 0 && (
        <div className="promo-usage-limits__current mb-4">
          <span className="text-brand font-bold text-sm">{usedCount}</span>
          <span className="text-muted text-sm"> total redemptions so far</span>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <label className="promo-create-panel__field">
          Max total uses
          <input
            className="input-field"
            type="number"
            min={1}
            placeholder="Unlimited"
            value={limits.maxTotal ?? ''}
            onChange={(e) => set('maxTotal', e.target.value)}
          />
        </label>
        <label className="promo-create-panel__field">
          Max per customer
          <input
            className="input-field"
            type="number"
            min={1}
            placeholder="Unlimited"
            value={limits.maxPerCustomer ?? ''}
            onChange={(e) => set('maxPerCustomer', e.target.value)}
          />
        </label>
        <label className="promo-create-panel__field">
          Max per day
          <input
            className="input-field"
            type="number"
            min={1}
            placeholder="Unlimited"
            value={limits.maxPerDay ?? ''}
            onChange={(e) => set('maxPerDay', e.target.value)}
          />
        </label>
        <label className="promo-create-panel__field">
          Stock limit
          <input
            className="input-field"
            type="number"
            min={0}
            placeholder="Unlimited"
            value={limits.stock ?? ''}
            onChange={(e) => set('stock', e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
