import { describe, expect, it } from 'vitest';
import { emptyPromotionForm } from '@/components/admin/promotions/PromotionCreatePanel';
import {
  formToPayload,
  hasPromotionSetupBasics,
  isPromotionEndDateValid,
  mergePromotionFormInitial,
} from './promotionFormUtils';

describe('isPromotionEndDateValid', () => {
  it('returns false for empty string', () => {
    expect(isPromotionEndDateValid('')).toBe(false);
  });

  it('returns false for whitespace only', () => {
    expect(isPromotionEndDateValid('   ')).toBe(false);
  });

  it('returns true when a datetime-local value is set', () => {
    expect(isPromotionEndDateValid('2026-09-20T10:00')).toBe(true);
  });

  it('returns true when the value has surrounding whitespace', () => {
    expect(isPromotionEndDateValid('  2026-09-20T10:00  ')).toBe(true);
  });
});

describe('hasPromotionSetupBasics', () => {
  const ready = {
    promotionKind: 'PERCENTAGE_DISCOUNT',
    code: 'SAVE10',
    activateImmediately: true,
    startsAt: '',
    expiresAt: '2026-09-20T10:00',
  };

  it('requires an end date', () => {
    expect(hasPromotionSetupBasics({ ...ready, expiresAt: '' }, true)).toBe(false);
  });

  it('requires a promo code when the kind uses one', () => {
    expect(hasPromotionSetupBasics({ ...ready, code: 'AB' }, true)).toBe(false);
  });

  it('requires a start date when activation is scheduled', () => {
    expect(hasPromotionSetupBasics({ ...ready, activateImmediately: false, startsAt: '' }, true)).toBe(false);
  });

  it('returns true when required setup fields are present', () => {
    expect(hasPromotionSetupBasics(ready, true)).toBe(true);
  });
});

describe('formToPayload expiresAt', () => {
  const baseForm = mergePromotionFormInitial({
    ...emptyPromotionForm(),
    promotionKind: 'PERCENTAGE_DISCOUNT',
    code: 'SAVE10',
    promotionRules: { discountPercent: 10, minSpend: 0 },
  });

  it('omits expiresAt when blank', () => {
    const payload = formToPayload({ ...baseForm, expiresAt: '' });
    expect(payload.expiresAt).toBeUndefined();
  });

  it('includes ISO expiresAt when set', () => {
    const payload = formToPayload({ ...baseForm, expiresAt: '2026-09-20T10:00' });
    expect(typeof payload.expiresAt).toBe('string');
    expect(payload.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
