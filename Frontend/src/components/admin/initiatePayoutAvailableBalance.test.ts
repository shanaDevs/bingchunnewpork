import { describe, expect, it } from 'vitest';
import { resolveInitiatePayoutAvailableBalance } from '@/components/admin/initiatePayoutAvailableBalance';

describe('resolveInitiatePayoutAvailableBalance', () => {
  it('FIRST payout: full pool available, then minus net payout (final pay)', () => {
    const view = resolveInitiatePayoutAvailableBalance({
      onlineWalletAvailableLkr: 50_000,
      priorPairNetPayoutFinalPayLkr: 0,
      cycleStage: 'FIRST',
      netPayoutFinalPayLkr: 21_081.69,
    });
    expect(view.availableBeforePayoutLkr).toBe(50_000);
    expect(view.availableAfterPayoutLkr).toBeCloseTo(28_918.31, 2);
  });

  it('SECOND payout: available after payout 1 net payout (final pay)', () => {
    const view = resolveInitiatePayoutAvailableBalance({
      onlineWalletAvailableLkr: 28_918.31,
      priorPairNetPayoutFinalPayLkr: 21_081.69,
      cycleStage: 'SECOND',
      netPayoutFinalPayLkr: 19_026.71,
    });
    expect(view.onlinePoolLkr).toBeCloseTo(50_000, 2);
    expect(view.availableBeforePayoutLkr).toBeCloseTo(28_918.31, 2);
    expect(view.availableAfterPayoutLkr).toBeCloseTo(9_891.6, 2);
  });
});
