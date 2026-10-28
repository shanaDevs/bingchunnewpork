import { describe, expect, it } from 'vitest';
import { buildInvoicePromoSummaryFromUsages } from '../../src/lib/withdrawalInvoice';

describe('buildInvoicePromoSummaryFromUsages', () => {
  it('groups by promo code and ownership and sums payback for platform promos', () => {
    const summary = buildInvoicePromoSummaryFromUsages(
      [
        {
          promoCode: 'SUMMER10',
          ownership: 'PLATFORM',
          totalDiscountAmount: 8600,
          platformShareAmount: 8600,
          branchShareAmount: 0,
        },
        {
          promoCode: 'SUMMER10',
          ownership: 'PLATFORM',
          totalDiscountAmount: 10000,
          platformShareAmount: 10000,
          branchShareAmount: 0,
        },
        {
          promoCode: 'BRANCHWEL',
          ownership: 'BRANCH',
          totalDiscountAmount: 5000,
          platformShareAmount: 0,
          branchShareAmount: 5000,
        },
        {
          promoCode: 'COLLAB5',
          ownership: 'SHARED',
          totalDiscountAmount: 3000,
          platformShareAmount: 1500,
          branchShareAmount: 1500,
        },
      ],
      true,
    );

    expect(summary).not.toBeNull();
    expect(summary!.lines).toHaveLength(3);
    expect(summary!.platformTotalCents).toBe(18600);
    expect(summary!.branchTotalCents).toBe(5000);
    expect(summary!.sharedTotalCents).toBe(3000);
    expect(summary!.platformPaybackCents).toBe(18600);

    const summer = summary!.lines.find((line) => line.promoCode === 'SUMMER10');
    expect(summer?.totalDiscountAmount).toBe(18600);
    expect(summer?.ownership).toBe('PLATFORM');
  });

  it('returns null when no usages exist', () => {
    expect(buildInvoicePromoSummaryFromUsages([], true)).toBeNull();
  });

  it('does not include payback when store payback is disabled', () => {
    const summary = buildInvoicePromoSummaryFromUsages(
      [
        {
          promoCode: 'FLASH20',
          ownership: 'PLATFORM',
          totalDiscountAmount: 10000,
          platformShareAmount: 10000,
          branchShareAmount: 0,
        },
      ],
      false,
    );

    expect(summary?.platformPaybackCents).toBe(0);
  });
});
