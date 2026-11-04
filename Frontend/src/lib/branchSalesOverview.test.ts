import { describe, expect, it } from 'vitest';
import {
  branchProductGrossSales,
  buildBranchGrossRevenueBreakdown,
  buildBranchSalesOverviewPoints,
  buildSalesVsDiscountSeries,
} from './branchSalesOverview';

describe('buildBranchSalesOverviewPoints', () => {
  it('allocates unmatched refunds and period fees across revenue periods', () => {
    const result = buildBranchSalesOverviewPoints({
      orderSummaryChart: [
        { label: 'Jan', delivery: 100, pickupCash: 0, pickupOnline: 0, pickupCard: 0, productSales: 80 },
        { label: 'Feb', delivery: 300, pickupCash: 0, pickupOnline: 0, pickupCard: 0, productSales: 250 },
      ],
      refundByMonth: [
        { month: 'Jan', amountLkr: 50 },
        { month: 'Mar', amountLkr: 100 },
      ],
      commissionFee: 10,
      gatewayFee: 5,
      pickupOnly: false,
    });

    expect(result[0].outflow).toBeGreaterThan(50);
    expect(result[1].outflow).toBeGreaterThan(0);
    expect(result.reduce((sum, row) => sum + row.outflow, 0)).toBe(165);
  });

  it('uses productSales when provided (excludes delivery & convenience fees)', () => {
    const result = buildBranchSalesOverviewPoints({
      orderSummaryChart: [
        { label: 'Jan', delivery: 500, pickupCash: 100, pickupOnline: 0, pickupCard: 0, productSales: 90 },
      ],
      refundByMonth: [],
      commissionFee: 0,
      gatewayFee: 0,
      pickupOnly: false,
    });

    expect(result[0].revenue).toBe(90);
  });

  it('excludes delivery from revenue when pickup-only', () => {
    const result = buildBranchSalesOverviewPoints({
      orderSummaryChart: [
        { label: 'Jan', delivery: 500, pickupCash: 100, pickupOnline: 0, pickupCard: 0, productSales: 100 },
      ],
      refundByMonth: [],
      commissionFee: 0,
      gatewayFee: 0,
      pickupOnly: true,
    });

    expect(result[0].revenue).toBe(100);
  });
});

describe('buildSalesVsDiscountSeries', () => {
  it('joins discounts by period label', () => {
    expect(
      buildSalesVsDiscountSeries(
        [{ period: 'Jan', revenue: 1000, outflow: 0 }],
        [{ month: 'Jan', totalDiscount: 80 }],
      ),
    ).toEqual([{ period: 'Jan', revenue: 1000, discount: 80 }]);
  });
});

describe('buildBranchGrossRevenueBreakdown', () => {
  it('splits gross into product, delivery, convenience, and other', () => {
    expect(
      buildBranchGrossRevenueBreakdown(
        { grossSales: 1000, totalDeliveryRevenue: 200, totalConvenienceRevenue: 50 },
        false,
      ),
    ).toEqual({
      productSales: 750,
      delivery: 200,
      convenience: 50,
      other: 0,
    });
  });
});

describe('branchProductGrossSales', () => {
  it('prefers productGrossSales from API', () => {
    expect(
      branchProductGrossSales({
        productGrossSales: 750,
        grossSales: 1000,
        totalDeliveryRevenue: 200,
        totalConvenienceRevenue: 50,
      }),
    ).toBe(750);
  });
});
