import { describe, expect, it } from 'vitest';
import { resolvePayoutPeriodIncompleteState } from './biweeklyPeriods';

describe('resolvePayoutPeriodIncompleteState', () => {
  it('does not flag an elapsed Payouts Due cycle as incomplete', () => {
    expect(
      resolvePayoutPeriodIncompleteState({
        periodFrom: '2026-10-01',
        periodTo: '2026-10-30',
        days: 30,
        today: '2026-11-11',
      }),
    ).toEqual({ incomplete: false, completeEndDate: null });
  });

  it('uses the locked 30-day end even when periodDays is still 15', () => {
    expect(
      resolvePayoutPeriodIncompleteState({
        periodFrom: '2026-10-01',
        periodTo: '2026-10-30',
        days: 15,
        today: '2026-11-11',
      }),
    ).toEqual({ incomplete: false, completeEndDate: null });
  });

  it('still warns while the selected window has not elapsed', () => {
    expect(
      resolvePayoutPeriodIncompleteState({
        periodFrom: '2026-10-31',
        periodTo: '2026-11-11',
        days: 15,
        today: '2026-11-11',
      }),
    ).toEqual({ incomplete: true, completeEndDate: '2026-11-14' });
  });
});
