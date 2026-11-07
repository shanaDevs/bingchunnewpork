'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import type { PromotionKind, PromotionRules, SelectedPromoProduct } from '@/lib/promotionTypes';
import {
  getCategoryForKind,
  getPromotionTypeOption,
  PROMOTION_KIND_CATEGORIES,
} from '@/lib/promotionTypes';
import PromotionProductPicker, { PromotionCategoryPicker } from '@/components/admin/promotions/PromotionProductPicker';

function syncPrimaryProduct(rules: PromotionRules, products: SelectedPromoProduct[]): PromotionRules {
  // Non-bundle offers may only bind one product.
  const limited = products.slice(0, 1);
  const primary = limited[0];
  return {
    ...rules,
    selectedProducts: limited,
    productId: primary?.id,
    productName: primary?.name,
  };
}

function syncGiftProduct(rules: PromotionRules, product: SelectedPromoProduct | undefined): PromotionRules {
  return {
    ...rules,
    giftProduct: product,
    giftProductId: product?.id,
    giftProductName: product?.name,
  };
}

function syncComboProducts(rules: PromotionRules, products: SelectedPromoProduct[]): PromotionRules {
  return {
    ...rules,
    comboProducts: products,
    comboItems: products.map((p) => p.name).join(', '),
  };
}

interface PromotionTypeSelectorProps {
  kind: PromotionKind | '';
  onChange: (kind: PromotionKind, criteriaKey: string) => void;
  onClear?: () => void;
}

export default function PromotionTypeSelector({ kind, onChange, onClear }: PromotionTypeSelectorProps) {
  const [categoryId, setCategoryId] = useState(() => {
    if (!kind) return '';
    return getCategoryForKind(kind as PromotionKind)?.id ?? '';
  });
  const [categoryQuery, setCategoryQuery] = useState('');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [offerQuery, setOfferQuery] = useState('');
  const [offerOpen, setOfferOpen] = useState(false);

  useEffect(() => {
    if (!kind) return;
    const cat = getCategoryForKind(kind as PromotionKind);
    if (cat) setCategoryId(cat.id);
  }, [kind]);

  const selectedCategory = PROMOTION_KIND_CATEGORIES.find((c) => c.id === categoryId);
  const selectedType = kind ? getPromotionTypeOption(kind as PromotionKind) : undefined;
  const kindMatchesCategory = Boolean(
    selectedCategory && kind && selectedCategory.types.some((t) => t.kind === kind),
  );

  const filteredCategories = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase();
    if (!q) return PROMOTION_KIND_CATEGORIES;
    return PROMOTION_KIND_CATEGORIES.filter(
      (cat) =>
        cat.label.toLowerCase().includes(q) ||
        cat.types.some(
          (t) =>
            t.label.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q),
        ),
    );
  }, [categoryQuery]);

  const filteredOffers = useMemo(() => {
    if (!selectedCategory) return [];
    const q = offerQuery.trim().toLowerCase();
    if (!q) return selectedCategory.types;
    return selectedCategory.types.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [selectedCategory, offerQuery]);

  function selectCategory(id: string) {
    const nextCategory = PROMOTION_KIND_CATEGORIES.find((c) => c.id === id);
    if (kind && nextCategory && !nextCategory.types.some((t) => t.kind === kind)) {
      onClear?.();
    }
    setCategoryId(id);
    setCategoryQuery('');
    setCategoryOpen(false);
    setOfferQuery('');
    setOfferOpen(true);
  }

  function selectOffer(typeKind: PromotionKind, criteriaKey: string) {
    onChange(typeKind, criteriaKey);
    setOfferQuery('');
    setOfferOpen(false);
  }

  return (
    <div className="promo-type-selector">
      <h3 className="promo-criteria__heading">Promotion Type *</h3>

          {selectedType && selectedCategory && kindMatchesCategory && (
        <div className="promo-type-selector__summary" aria-live="polite">
          <span className="promo-type-selector__summary-badge">{selectedCategory.label}</span>
          <span className="promo-type-selector__summary-label">{selectedType.label}</span>
          <span className="promo-type-selector__summary-tag">
            {selectedType.requiresPromoCode ? 'Checkout code required' : 'Add to Cup — no code needed'}
          </span>
        </div>
      )}

      <div className="promo-type-selector__fields">
        <label className="promo-create-panel__field">
          Category
          <div className="promo-type-selector__search-wrap">
            <Search size={15} className="promo-type-selector__search-icon" aria-hidden />
            <input
              className="input-field promo-type-selector__search"
              placeholder="e.g. Product Based, Delivery, Discount…"
              value={categoryOpen ? categoryQuery : (selectedCategory?.label ?? categoryQuery)}
              onChange={(e) => {
                setCategoryQuery(e.target.value);
                setCategoryOpen(true);
              }}
              onFocus={() => {
                setCategoryQuery(selectedCategory?.label ?? '');
                setCategoryOpen(true);
              }}
              onBlur={() => window.setTimeout(() => setCategoryOpen(false), 150)}
            />
            {categoryOpen && (
              <div className="promo-type-selector__dropdown" role="listbox" aria-label="Promotion categories">
                {filteredCategories.length === 0 && (
                  <p className="promo-type-selector__empty">No matching categories</p>
                )}
                {filteredCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`promo-type-selector__dropdown-item${categoryId === cat.id ? ' promo-type-selector__dropdown-item--active' : ''}`}
                    role="option"
                    aria-selected={categoryId === cat.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectCategory(cat.id)}
                  >
                    <span className="promo-type-selector__dropdown-label">{cat.label}</span>
                    <span className="promo-type-selector__dropdown-meta">
                      {cat.types.length} offer{cat.types.length === 1 ? '' : 's'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>

        {selectedCategory && (
          <label className="promo-create-panel__field">
            Offer
            <div className="promo-type-selector__search-wrap">
              <Search size={15} className="promo-type-selector__search-icon" aria-hidden />
              <input
                className="input-field promo-type-selector__search"
                placeholder="Search offers…"
                value={offerOpen ? offerQuery : (kindMatchesCategory ? selectedType?.label ?? '' : '')}
                onChange={(e) => {
                  setOfferQuery(e.target.value);
                  setOfferOpen(true);
                }}
                onFocus={() => {
                  setOfferQuery(kindMatchesCategory ? selectedType?.label ?? '' : '');
                  setOfferOpen(true);
                }}
                onBlur={() => window.setTimeout(() => setOfferOpen(false), 150)}
              />
              {offerOpen && (
                <div className="promo-type-selector__dropdown" role="listbox" aria-label="Promotion offers">
                  {filteredOffers.length === 0 && (
                    <p className="promo-type-selector__empty">No matching offers</p>
                  )}
                  {filteredOffers.map((type) => (
                    <button
                      key={type.kind}
                      type="button"
                      className={`promo-type-selector__dropdown-item promo-type-selector__dropdown-item--offer${kind === type.kind ? ' promo-type-selector__dropdown-item--active' : ''}`}
                      role="option"
                      aria-selected={kind === type.kind}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectOffer(type.kind, type.criteriaKey)}
                    >
                    <span className="promo-type-selector__dropdown-label">{type.label}</span>
                    <span className="promo-type-selector__dropdown-tag">
                      {type.requiresPromoCode ? 'Checkout code' : 'Add to Cup — no code'}
                    </span>
                      {kind === type.kind && (
                        <Check size={14} className="promo-type-selector__dropdown-check" aria-hidden />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>
        )}
      </div>
    </div>
  );
}

interface PromotionRulesFormProps {
  kind: PromotionKind;
  rules: PromotionRules;
  onChange: (rules: PromotionRules) => void;
  promoTitle?: string;
  promoDescription?: string;
  promoCode?: string;
}

export function PromotionRulesForm({
  kind,
  rules,
  onChange,
  promoTitle = '',
  promoDescription = '',
  promoCode = 'PROMO',
}: PromotionRulesFormProps) {
  useEffect(() => {
    if (kind !== 'BOGO') return;
    if (rules.buyQty === 1 && rules.getQty === 1) return;
    onChange({ ...rules, buyQty: 1, getQty: 1 });
  }, [kind, rules.buyQty, rules.getQty, onChange, rules]);

  // BOGO / BXGY: only one qualifying product (combo/bundle may select many).
  useEffect(() => {
    if (kind !== 'BOGO' && kind !== 'BXGY') return;
    const selected = rules.selectedProducts ?? [];
    if (selected.length <= 1) return;
    onChange(syncPrimaryProduct(rules, selected.slice(0, 1)));
    // Only clamp when multi-select sneaks in; avoid depending on full rules object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, rules.selectedProducts, onChange]);

  function set(field: keyof PromotionRules, value: PromotionRules[keyof PromotionRules]) {
    onChange({ ...rules, [field]: value });
  }

  const fields: React.ReactNode[] = [];

  if (kind === 'BOGO') {
    fields.push(
      <label key="buyQty" className="promo-create-panel__field">
        Buy quantity
        <input
          className="input-field promo-rules-form__locked"
          type="number"
          value={1}
          readOnly
          disabled
          aria-readonly="true"
        />
      </label>,
      <label key="getQty" className="promo-create-panel__field">
        Get quantity (free)
        <input
          className="input-field promo-rules-form__locked"
          type="number"
          value={1}
          readOnly
          disabled
          aria-readonly="true"
        />
      </label>,
      <div key="product" className="sm:col-span-2">
        <PromotionProductPicker
          label="Qualifying product"
          hint="One product only for this offer"
          selected={rules.selectedProducts ?? (rules.productId ? [{ id: rules.productId, name: rules.productName ?? '' }] : [])}
          onChange={(products) => onChange(syncPrimaryProduct({ ...rules, buyQty: 1, getQty: 1 }, products))}
          multiple={false}
          placeholder="Search product by name…"
        />
      </div>,
    );
  }

  if (kind === 'BXGY') {
    fields.push(
      <label key="buyQty" className="promo-create-panel__field">
        Buy quantity
        <input className="input-field" type="number" min={1} value={rules.buyQty ?? 2} onChange={(e) => set('buyQty', Number(e.target.value))} />
      </label>,
      <label key="getQty" className="promo-create-panel__field">
        Get quantity (free/discounted)
        <input className="input-field" type="number" min={1} value={rules.getQty ?? 1} onChange={(e) => set('getQty', Number(e.target.value))} />
      </label>,
      <div key="product" className="sm:col-span-2">
        <PromotionProductPicker
          label="Qualifying product"
          hint="One product only for this offer"
          selected={rules.selectedProducts ?? (rules.productId ? [{ id: rules.productId, name: rules.productName ?? '' }] : [])}
          onChange={(products) => onChange(syncPrimaryProduct(rules, products))}
          multiple={false}
          placeholder="Search product by name…"
        />
      </div>,
    );
  }

  if (kind === 'GIFT_ITEM') {
    fields.push(
      <div key="gift" className="sm:col-span-2">
        <PromotionProductPicker
          label="Gift product"
          selected={rules.giftProduct ? [rules.giftProduct] : rules.giftProductId ? [{ id: rules.giftProductId, name: rules.giftProductName ?? '' }] : []}
          onChange={(products) => onChange(syncGiftProduct(rules, products[0]))}
          multiple={false}
          placeholder="Search gift product…"
        />
      </div>,
      <label key="minSpend" className="promo-create-panel__field">
        Min spend to qualify (LKR)
        <input className="input-field" type="number" min={0} value={rules.minSpend ?? ''} onChange={(e) => set('minSpend', Number(e.target.value))} />
      </label>,
    );
  }

  if (kind === 'CATEGORY_OFF') {
    fields.push(
      <div key="cat" className="sm:col-span-2">
        <PromotionCategoryPicker
          label="Category"
          value={rules.categoryName ?? ''}
          categoryId={rules.categoryId}
          onChange={(name, categoryId) => onChange({ ...rules, categoryName: name, categoryId })}
        />
      </div>,
      <label key="pct" className="promo-create-panel__field">
        Discount %
        <input className="input-field" type="number" min={1} max={100} value={rules.discountPercent ?? ''} onChange={(e) => set('discountPercent', Number(e.target.value))} />
      </label>,
    );
  }

  if (kind === 'COMBO_OFFER') {
    fields.push(
      <div key="combo" className="sm:col-span-2">
        <PromotionProductPicker
          label="Bundle products"
          hint="Select 2 or more products for this combo"
          selected={rules.comboProducts ?? []}
          onChange={(products) => onChange(syncComboProducts(rules, products))}
          multiple
          placeholder="Search products to add to bundle…"
        />
      </div>,
      <label key="comboPrice" className="promo-create-panel__field">
        Combo price (LKR)
        <input className="input-field" type="number" min={1} value={rules.discountAmount ?? ''} onChange={(e) => set('discountAmount', Number(e.target.value))} />
      </label>,
    );
  }

  if (kind === 'PERCENTAGE_DISCOUNT') {
    fields.push(
      <label key="pct" className="promo-create-panel__field">
        Discount %
        <input className="input-field" type="number" min={1} max={100} value={rules.discountPercent ?? ''} onChange={(e) => set('discountPercent', Number(e.target.value))} />
      </label>,
    );
  }

  if (kind === 'FIXED_DISCOUNT') {
    fields.push(
      <label key="amt" className="promo-create-panel__field">
        Discount amount (LKR)
        <input className="input-field" type="number" min={1} value={rules.discountAmount ?? ''} onChange={(e) => set('discountAmount', Number(e.target.value))} />
      </label>,
    );
  }

  if (kind === 'FREE_DELIVERY' || kind === 'REDUCED_DELIVERY' || kind === 'MIN_ORDER' || kind === 'SPEND_OVER') {
    fields.push(
      <label key="minSpend" className="promo-create-panel__field">
        Minimum spend (LKR)
        <input className="input-field" type="number" min={0} value={rules.minSpend ?? ''} onChange={(e) => set('minSpend', Number(e.target.value))} />
      </label>,
    );
  }

  if (kind === 'REDUCED_DELIVERY') {
    fields.push(
      <label key="delRed" className="promo-create-panel__field">
        Delivery fee reduction (LKR)
        <input className="input-field" type="number" min={1} value={rules.deliveryFeeReduction ?? ''} onChange={(e) => set('deliveryFeeReduction', Number(e.target.value))} />
      </label>,
    );
  }

  if (kind === 'DELIVERY_ZONE') {
    fields.push(
      <label key="zone" className="promo-create-panel__field sm:col-span-2">
        Delivery zone name
        <input className="input-field" placeholder="e.g. Colombo 05" value={rules.deliveryZone ?? ''} onChange={(e) => set('deliveryZone', e.target.value)} />
      </label>,
    );
  }

  if (kind === 'DELIVERY_DISTANCE') {
    fields.push(
      <label key="dist" className="promo-create-panel__field">
        Max distance (km)
        <input className="input-field" type="number" min={1} value={rules.maxDistanceKm ?? ''} onChange={(e) => set('maxDistanceKm', Number(e.target.value))} />
      </label>,
    );
  }

  if (kind === 'BULK_ORDER') {
    fields.push(
      <label key="bulk" className="promo-create-panel__field">
        Minimum items in order
        <input className="input-field" type="number" min={2} value={rules.bulkMinQty ?? ''} onChange={(e) => set('bulkMinQty', Number(e.target.value))} />
      </label>,
      <label key="bulkDisc" className="promo-create-panel__field">
        Discount %
        <input className="input-field" type="number" min={1} max={100} value={rules.discountPercent ?? ''} onChange={(e) => set('discountPercent', Number(e.target.value))} />
      </label>,
    );
  }

  if (kind === 'HAPPY_HOUR' || kind === 'TIME_SLOT') {
    fields.push(
      <label key="ts" className="promo-create-panel__field">
        Start time
        <input className="input-field" type="time" value={rules.timeStart ?? ''} onChange={(e) => set('timeStart', e.target.value)} />
      </label>,
      <label key="te" className="promo-create-panel__field">
        End time
        <input className="input-field" type="time" value={rules.timeEnd ?? ''} onChange={(e) => set('timeEnd', e.target.value)} />
      </label>,
    );
  }

  if (kind === 'WALLET_OFFER' || kind === 'BANK_OFFER' || kind === 'CARD_OFFER') {
    fields.push(
      <label key="pay" className="promo-create-panel__field">
        {kind === 'BANK_OFFER' ? 'Bank name' : kind === 'CARD_OFFER' ? 'Card network' : 'Wallet / method'}
        <input
          className="input-field"
          placeholder={kind === 'BANK_OFFER' ? 'Commercial Bank' : kind === 'CARD_OFFER' ? 'Visa / Mastercard' : 'Online wallet'}
          value={rules.paymentMethod ?? rules.bankName ?? rules.cardNetwork ?? ''}
          onChange={(e) => set(kind === 'BANK_OFFER' ? 'bankName' : kind === 'CARD_OFFER' ? 'cardNetwork' : 'paymentMethod', e.target.value)}
        />
      </label>,
      <label key="payDisc" className="promo-create-panel__field">
        Extra discount %
        <input className="input-field" type="number" min={1} max={100} value={rules.discountPercent ?? ''} onChange={(e) => set('discountPercent', Number(e.target.value))} />
      </label>,
    );
  }

  if (kind === 'LOYALTY_TIER') {
    fields.push(
      <label key="tier" className="promo-create-panel__field">
        Loyalty tier
        <input className="input-field" placeholder="Gold / Platinum" value={rules.loyaltyTier ?? ''} onChange={(e) => set('loyaltyTier', e.target.value)} />
      </label>,
      <label key="tierDisc" className="promo-create-panel__field">
        Tier discount %
        <input className="input-field" type="number" min={1} max={100} value={rules.discountPercent ?? ''} onChange={(e) => set('discountPercent', Number(e.target.value))} />
      </label>,
    );
  }

  if (kind === 'WELCOME' || kind === 'REFERRAL') {
    const mode = rules.referralDiscountMode
      ?? (rules.discountAmount && !rules.discountPercent ? 'FIXED' : 'PERCENTAGE');
    fields.push(
      <label key="discMode" className="promo-create-panel__field">
        Discount type
        <select
          className="input-field"
          value={mode}
          onChange={(e) => {
            const next = e.target.value as 'PERCENTAGE' | 'FIXED';
            onChange({
              ...rules,
              referralDiscountMode: next,
              ...(next === 'PERCENTAGE'
                ? { discountPercent: rules.discountPercent ?? 10, discountAmount: undefined }
                : { discountAmount: rules.discountAmount ?? 100, discountPercent: undefined }),
            });
          }}
        >
          <option value="PERCENTAGE">Percentage off</option>
          <option value="FIXED">Fixed amount off (LKR)</option>
        </select>
      </label>,
      mode === 'PERCENTAGE' ? (
        <label key="welcomePct" className="promo-create-panel__field">
          Discount %
          <input
            className="input-field"
            type="number"
            min={1}
            max={100}
            value={rules.discountPercent ?? ''}
            onChange={(e) => set('discountPercent', Number(e.target.value))}
          />
        </label>
      ) : (
        <label key="welcomeAmt" className="promo-create-panel__field">
          Discount amount (LKR)
          <input
            className="input-field"
            type="number"
            min={1}
            value={rules.discountAmount ?? ''}
            onChange={(e) => set('discountAmount', Number(e.target.value))}
          />
        </label>
      ),
      <label key="welcomeMin" className="promo-create-panel__field">
        Minimum spend (LKR)
        <input
          className="input-field"
          type="number"
          min={0}
          value={rules.minSpend ?? 0}
          onChange={(e) => set('minSpend', Number(e.target.value))}
        />
      </label>,
      <p key="welcomeHint" className="sm:col-span-2 text-sm text-muted leading-relaxed">
        {kind === 'WELCOME'
          ? 'Only customers placing their first non-cancelled order can redeem this code.'
          : 'Only customers who signed up with a referral link can redeem this code. Set max uses per customer under Usage Limits (recommended: 1).'}
      </p>,
    );
  }

  if (kind === 'SEASONAL') {
    fields.push(
      <label key="season" className="promo-create-panel__field sm:col-span-2">
        Seasonal event
        <select className="input-field" value={rules.seasonalEvent ?? ''} onChange={(e) => set('seasonalEvent', e.target.value)}>
          <option value="">Select event</option>
          {['Vesak', 'Ramadan', 'New Year', 'Christmas', "Valentine's", 'Anniversary'].map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </label>,
    );
  }

  if (kind === 'NEW_PRODUCT') {
    fields.push(
      <div key="newProd" className="sm:col-span-2">
        <PromotionProductPicker
          label="Launch product"
          selected={rules.selectedProducts ?? (rules.productId ? [{ id: rules.productId, name: rules.productName ?? '' }] : [])}
          onChange={(products) => onChange(syncPrimaryProduct(rules, products))}
          multiple={false}
        />
      </div>,
      <label key="launchDisc" className="promo-create-panel__field">
        Launch discount %
        <input className="input-field" type="number" min={1} max={100} value={rules.discountPercent ?? ''} onChange={(e) => set('discountPercent', Number(e.target.value))} />
      </label>,
    );
  }

  if (kind === 'UPLOAD_BANNER') {
    return null;
  }

  if (kind === 'CUSTOM') {
    fields.push(
      <label key="customBenefit" className="promo-create-panel__field sm:col-span-2">
        Custom benefit text *
        <input
          className="input-field"
          placeholder="e.g. Buy any 2 drinks, get 1 free on weekends"
          value={rules.customBenefit ?? ''}
          onChange={(e) => set('customBenefit', e.target.value)}
        />
      </label>,
      <label key="customDisc" className="promo-create-panel__field">
        Discount % (optional)
        <input className="input-field" type="number" min={0} max={100} value={rules.discountPercent ?? ''} onChange={(e) => set('discountPercent', Number(e.target.value))} />
      </label>,
      <label key="customAmt" className="promo-create-panel__field">
        Fixed discount LKR (optional)
        <input className="input-field" type="number" min={0} value={rules.discountAmount ?? ''} onChange={(e) => set('discountAmount', Number(e.target.value))} />
      </label>,
      <div key="customProd" className="sm:col-span-2">
        <PromotionProductPicker
          label="Linked product (optional)"
          selected={rules.selectedProducts ?? (rules.productId ? [{ id: rules.productId, name: rules.productName ?? '' }] : [])}
          onChange={(products) => onChange(syncPrimaryProduct(rules, products))}
          multiple={false}
        />
      </div>,
    );
  }

  if (fields.length === 0) return null;

  return (
    <div className="promo-rules-form card p-4 mt-4">
      <h4 className="text-sm font-bold text-white mb-3">Promotion Rules</h4>
      <div className="grid sm:grid-cols-2 gap-4">{fields}</div>
    </div>
  );
}
