import { describe, expect, it } from 'vitest';
import {
  onlineWalletDebitLkrFromPayout,
  resolveInitiatePayoutAvailableBalance,
} from '@/components/admin/initiatePayoutAvailableBalance';

describe('resolveInitiatePayoutAvailableBalance', () => {
  it('shows full withdrawable pool before payout, then minus net payout (final pay)', () => {
    const view = resolveInitiatePayoutAvailableBalance({
      withdrawablePoolLkr: 12_770.73,
      netPayoutFinalPayLkr: 12_412.05,
    });
    expect(view.availableBeforePayoutLkr).toBeCloseTo(12_770.73, 2);
    expect(view.onlineWalletDebitLkr).toBeCloseTo(12_412.05, 2);
    expect(view.availableAfterPayoutLkr).toBeCloseTo(358.68, 2);
  });

  it('matches all-time balance after prior branch receivable (no prior add-back)', () => {
    const view = resolveInitiatePayoutAvailableBalance({
      withdrawablePoolLkr: 12_770.73,
      netPayoutFinalPayLkr: 19_192.95,
    });
    expect(view.availableBeforePayoutLkr).toBeCloseTo(12_770.73, 2);
    expect(view.availableAfterPayoutLkr).toBe(0);
  });

  it('does not deduct Jason discounts from available online wallet after payout', () => {
    const view = resolveInitiatePayoutAvailableBalance({
      withdrawablePoolLkr: 7_475.38,
      netPayoutFinalPayLkr: 6_944.2,
      jasonDiscountsLkr: 124,
    });
    expect(view.availableBeforePayoutLkr).toBeCloseTo(7_475.38, 2);
    expect(view.onlineWalletDebitLkr).toBeCloseTo(6_820.2, 2);
    expect(view.availableAfterPayoutLkr).toBeCloseTo(655.18, 2);
  });
});

describe('onlineWalletDebitLkrFromPayout', () => {
  it('leaves the full final pay when Jason discounts are zero', () => {
    expect(
      onlineWalletDebitLkrFromPayout({
        netPayoutFinalPayLkr: 6_944.2,
        jasonDiscountsLkr: 0,
      }),
    ).toBeCloseTo(6_944.2, 2);
  });

  it('excludes Jason discounts from the branch online-wallet debit', () => {
    expect(
      onlineWalletDebitLkrFromPayout({
        netPayoutFinalPayLkr: 6_944.2,
        jasonDiscountsLkr: 124,
      }),
    ).toBeCloseTo(6_820.2, 2);
  });
});
