import { describe, expect, it } from 'vitest';
import {
  commissionRateToDisplayPct,
  resolveSlabRatePct,
  resolveSlabRatePctFromPreview,
} from '@/components/admin/commissionUtils';

describe('commissionRateToDisplayPct', () => {
  it('converts decimal rates to one-decimal percent', () => {
    expect(commissionRateToDisplayPct(0.065)).toBe(6.5);
    expect(commissionRateToDisplayPct(0.055)).toBe(5.5);
  });
});

describe('resolveSlabRatePct', () => {
  it('returns the first positive rate', () => {
    expect(resolveSlabRatePct(0, null, 0.05)).toBe(5);
    expect(resolveSlabRatePct(undefined, 0.065)).toBe(6.5);
  });

  it('returns null when no positive rate exists', () => {
    expect(resolveSlabRatePct(0, null, undefined)).toBeNull();
  });
});

describe('resolveSlabRatePctFromPreview', () => {
  it('reads effectiveRate from settlement preview', () => {
    expect(
      resolveSlabRatePctFromPreview({
        slabInfo: { monthlyBase: 0, effectiveRate: 0.045, slabIndex: 3 },
      }),
    ).toBe(4.5);
  });
});
