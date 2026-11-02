import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';
import {
  buildPromoDiscountReport,
  parsePromoReportRange,
  type PromoDiscountUsageRow,
} from '../../src/lib/promotionDiscountReport';

function usage(partial: Partial<PromoDiscountUsageRow> & Pick<PromoDiscountUsageRow, 'storeId' | 'promoCode'>): PromoDiscountUsageRow {
  return {
    storeName: partial.storeName ?? 'Branch',
    promoCodeId: partial.promoCodeId ?? null,
    promoTitle: partial.promoTitle ?? null,
    ownership: partial.ownership ?? 'PLATFORM',
    totalDiscountAmount: partial.totalDiscountAmount ?? 0,
    branchShareAmount: partial.branchShareAmount ?? 0,
    platformShareAmount: partial.platformShareAmount ?? 0,
    orderSubtotal: partial.orderSubtotal ?? 0,
    ...partial,
  };
}

describe('parsePromoReportRange', () => {
  it('uses Colombo day bounds', () => {
    const { fromDate, toDate } = parsePromoReportRange('2026-08-01', '2026-08-29');
    expect(fromDate.toISOString()).toBe('2026-07-31T18:30:00.000Z');
    expect(toDate.toISOString()).toBe('2026-08-29T18:29:59.999Z');
  });

  it('rejects inverted ranges', () => {
    expect(() => parsePromoReportRange('2026-08-10', '2026-08-01')).toThrow(AppError);
  });
});

describe('buildPromoDiscountReport', () => {
  it('returns empty totals when there are no usages or sales', () => {
    const report = buildPromoDiscountReport([], '2026-08-01', '2026-08-29');
    expect(report.totals).toEqual({
      usageCount: 0,
      totalDiscount: 0,
      branchShare: 0,
      platformShare: 0,
      orderSales: 0,
      discountPct: 0,
      orderCount: 0,
      grossSales: 0,
    });
    expect(report.byBranch).toEqual([]);
    expect(report.byPromo).toEqual([]);
  });

  it('keeps a branch with sales even when no discount was applied', () => {
    const report = buildPromoDiscountReport(
      [],
      '2026-08-01',
      '2026-08-29',
      [{ storeId: 's3', storeName: 'Nugegoda', orderCount: 12, grossSales: 40000 }],
    );
    expect(report.byBranch).toHaveLength(1);
    expect(report.byBranch[0]).toMatchObject({
      storeId: 's3',
      orderCount: 12,
      grossSales: 40000,
      totalDiscount: 0,
      discountPct: 0,
    });
    expect(report.totals.grossSales).toBe(40000);
    expect(report.byPromo).toEqual([]);
  });

  it('groups by branch and by promo with sales and nested breakdowns', () => {
    const report = buildPromoDiscountReport(
      [
        usage({
          storeId: 's1',
          storeName: 'Kollupitiya',
          promoCode: 'WELCOME10',
          promoCodeId: 'p1',
          promoTitle: 'Welcome 10%',
          ownership: 'PLATFORM',
          totalDiscountAmount: 100,
          branchShareAmount: 0,
          platformShareAmount: 100,
          orderSubtotal: 1000,
        }),
        usage({
          storeId: 's1',
          storeName: 'Kollupitiya',
          promoCode: 'BOGO',
          promoCodeId: 'p2',
          promoTitle: 'BOGO Milk Tea',
          ownership: 'BRANCH',
          totalDiscountAmount: 250,
          branchShareAmount: 250,
          platformShareAmount: 0,
          orderSubtotal: 800,
        }),
        usage({
          storeId: 's2',
          storeName: 'Bambalapitiya',
          promoCode: 'WELCOME10',
          promoCodeId: 'p1',
          promoTitle: 'Welcome 10%',
          ownership: 'PLATFORM',
          totalDiscountAmount: 80,
          branchShareAmount: 0,
          platformShareAmount: 80,
          orderSubtotal: 800,
        }),
      ],
      '2026-08-01',
      '2026-08-29',
      [
        { storeId: 's1', storeName: 'Kollupitiya', orderCount: 20, grossSales: 50000 },
        { storeId: 's2', storeName: 'Bambalapitiya', orderCount: 8, grossSales: 12000 },
        { storeId: 's3', storeName: 'Nugegoda', orderCount: 5, grossSales: 9000 },
      ],
    );

    expect(report.totals).toMatchObject({
      usageCount: 3,
      totalDiscount: 430,
      branchShare: 250,
      platformShare: 180,
      orderSales: 2600,
      orderCount: 33,
      grossSales: 71000,
    });
    expect(report.totals.discountPct).toBe(0.61);

    expect(report.byBranch.map((b) => b.storeId)).toEqual(['s1', 's2', 's3']);
    expect(report.byBranch[0].grossSales).toBe(50000);
    expect(report.byBranch[0].totalDiscount).toBe(350);
    expect(report.byBranch[0].discountPct).toBe(0.7);
    expect(report.byBranch[0].promos.map((p) => p.promoCode)).toEqual(['BOGO', 'WELCOME10']);
    expect(report.byBranch[0].promos[0].orderSales).toBe(800);
    expect(report.byBranch[2].totalDiscount).toBe(0);

    const welcome = report.byPromo.find((p) => p.promoCode === 'WELCOME10');
    expect(welcome?.usageCount).toBe(2);
    expect(welcome?.totalDiscount).toBe(180);
    expect(welcome?.orderSales).toBe(1800);
    expect(welcome?.discountPct).toBe(10);
    expect(welcome?.branches.map((b) => b.storeId)).toEqual(['s1', 's2']);
  });
});
