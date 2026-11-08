import { describe, expect, it } from 'vitest';
import {
  applyFirstCycleTableDisplayMask,
  applySecondCycleListDisplayAmounts,
  findPairedFirstPayoutPeriodRow,
} from '@/components/admin/payoutPeriodRowCycleDisplay';

describe('applySecondCycleListDisplayAmounts', () => {
  it('keeps second-window convenience only for SECOND table display', () => {
    const merged = applySecondCycleListDisplayAmounts(
      {
        branchReceives: 19_026.71,
        commissionLkr: 1_840.96,
        orderConvenienceFeeLkr: 3_186,
        deliveryFee: 4_500,
      },
      {
        branchReceives: 18_834.22,
        commissionLkr: 0,
        orderConvenienceFeeLkr: 1_615,
        deliveryFee: 2_250,
      },
    );

    expect(merged.branchReceives).toBe(19_026.71);
    expect(merged.commissionLkr).toBe(1_840.96);
    expect(merged.orderConvenienceFeeLkr).toBe(3_186);
    expect(merged.deliveryFee).toBe(4_500);
  });
});

describe('applyFirstCycleTableDisplayMask', () => {
  it('hides convenience and platform columns for payout 1', () => {
    const masked = applyFirstCycleTableDisplayMask({
      branchReceives: 18_834.22,
      commissionLkr: 0,
      orderConvenienceFeeLkr: 1_615,
      deliveryFee: 2_250,
    });
    expect(masked.commissionLkr).toBeNull();
    expect(masked.orderConvenienceFeeLkr).toBeNull();
    expect(masked.deliveryFee).toBe(2_250);
  });
});

describe('findPairedFirstPayoutPeriodRow', () => {
  it('finds Sep 1–15 before Sep 16–30', () => {
    const rows = [
      { key: 'a', periodFrom: '2026-09-01', periodTo: '2026-09-15' },
      { key: 'b', periodFrom: '2026-09-16', periodTo: '2026-09-30' },
    ];
    const paired = findPairedFirstPayoutPeriodRow(rows, rows[1]!);
    expect(paired?.key).toBe('a');
  });
});
