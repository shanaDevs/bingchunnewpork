import { describe, expect, it } from 'vitest';
import { resolveInitiatePayoutAvailableBalance } from '@/components/admin/initiatePayoutAvailableBalance';

describe('resolveInitiatePayoutAvailableBalance', () => {
  it('shows full withdrawable pool before payout, then minus net payout (final pay)', () => {
    const view = resolveInitiatePayoutAvailableBalance({
      withdrawablePoolLkr: 12_770.73,
      netPayoutFinalPayLkr: 12_412.05,
    });
    expect(view.availableBeforePayoutLkr).toBeCloseTo(12_770.73, 2);
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
});
