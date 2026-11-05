import { describe, expect, it } from 'vitest';
import {
  filterPayoutRowsForDisplay,
  payoutSettlementPeriodOverlaps,
} from '@/components/admin/paymentHistoryPayoutFilter';
import { monthRange } from '@/components/admin/useWalletPeriodFilter';

describe('paymentHistoryPayoutFilter', () => {
  const octSettlement = {
    periodFrom: '2026-10-01',
    periodTo: '2026-10-15',
  };

  it('matches settlement billing window overlap', () => {
    expect(
      payoutSettlementPeriodOverlaps(octSettlement, '2026-10-01', '2026-10-26'),
    ).toBe(true);
    expect(
      payoutSettlementPeriodOverlaps(octSettlement, '2026-09-01', '2026-09-30'),
    ).toBe(false);
  });

  it('does not drop overlapping rows when wallet period is controlled', () => {
    const payouts = [
      {
        ...octSettlement,
        paidAt: '2026-11-05T10:00:00.000Z',
      },
    ];
    const filtered = filterPayoutRowsForDisplay(payouts, {
      periodControlled: true,
      embedded: true,
      payoutMonth: '',
      payoutDateFrom: '',
      payoutDateTo: '',
      monthRange,
    });
    expect(filtered).toHaveLength(1);
  });

  it('filters standalone page by settlement period, not payment date', () => {
    const payouts = [
      octSettlement,
      { periodFrom: '2026-09-01', periodTo: '2026-09-15' },
    ];
    const filtered = filterPayoutRowsForDisplay(payouts, {
      periodControlled: false,
      embedded: false,
      payoutMonth: '2026-10',
      payoutDateFrom: '',
      payoutDateTo: '',
      monthRange,
    });
    expect(filtered).toEqual([octSettlement]);
  });
});
