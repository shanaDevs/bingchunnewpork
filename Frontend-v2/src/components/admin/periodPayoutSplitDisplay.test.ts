import { describe, expect, it } from 'vitest';
import {
  formatPayoutAllocationPeriodLabel,
  resolvePeriodPayoutCardAmounts,
} from './periodPayoutSplitDisplay';

describe('resolvePeriodPayoutCardAmounts', () => {
  const split = {
    branchReceivesLkr: 100,
    commissionLkr: 20,
    convenienceFeeLkr: 5,
    deliveryFeeLkr: 15,
  };

  it('uses explicit overrides over payout split', () => {
    expect(
      resolvePeriodPayoutCardAmounts({
        payoutSplit: split,
        branchReceivesLkr: 200,
        platformCommissionLkr: 30,
        deliveryFeeLkr: 40,
      }),
    ).toEqual({
      branchReceives: 200,
      commissionLkr: 30,
      orderConvenienceFeeLkr: 5,
      deliveryFee: 40,
    });
  });

  it('falls back to period net when branch split is missing', () => {
    expect(
      resolvePeriodPayoutCardAmounts({
        payoutSplit: null,
        periodNetLkr: 88,
      }),
    ).toEqual({
      branchReceives: 88,
      commissionLkr: 0,
      orderConvenienceFeeLkr: 0,
      deliveryFee: 0,
    });
  });
});

describe('formatPayoutAllocationPeriodLabel', () => {
  it('returns null when both dates are missing', () => {
    expect(formatPayoutAllocationPeriodLabel()).toBeNull();
  });

  it('formats a range or single endpoint', () => {
    expect(formatPayoutAllocationPeriodLabel('2026-01-01', '2026-01-31')).toBe(
      '2026-01-01 - 2026-01-31',
    );
    expect(formatPayoutAllocationPeriodLabel('2026-01-01')).toBe('2026-01-01');
  });
});
