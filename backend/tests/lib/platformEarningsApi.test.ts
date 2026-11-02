import { describe, expect, it } from 'vitest';
import {
  serializeMonthlyEarningsBreakdown,
  serializeMonthlyEarningsSummary,
} from '../../src/lib/platformEarningsApi';

describe('platformEarningsApi', () => {
  it('serializes monthly summary money fields as cent strings', () => {
    const out = serializeMonthlyEarningsSummary({
      months: [
        {
          month: '2026-01',
          totalCommission: 12000,
          totalConvenienceFee: 3000,
          totalEarned: 15000,
          pendingEarned: 5000,
          orderCount: 10,
        },
      ],
      platformPosition: {
        lifetimeEarned: 100000,
        availableToSettle: 40000,
        settledWithdrawn: 60000,
        totalPayoutsTracked: 3,
      },
    } as never);

    expect(out.months[0].totalEarned).toBe('15000');
    expect(out.platformPosition.lifetimeEarned).toBe('100000');
  });

  it('serializes breakdown totals and line items', () => {
    const out = serializeMonthlyEarningsBreakdown({
      items: [
        {
          storeId: 's1',
          storeName: 'Branch',
          commissionAmount: 1000,
          convenienceFeeAmount: 200,
          platformPaybackAmount: 0,
          totalEarned: 1200,
        },
      ],
      branches: [],
      totals: {
        totalCommission: 1000,
        totalConvenienceFee: 200,
        totalEarned: 1200,
      },
    } as never);

    expect(out.totals.totalEarned).toBe('1200');
    expect(out.items[0].commissionAmount).toBe('1000');
  });
});
