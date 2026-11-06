import { describe, expect, it } from 'vitest';
import {
  FULL_CYCLE_INCLUSIVE_DAYS,
  resolvePayoutCycleDisplayRange,
  resolveSecondCycleFullDisplayRange,
  secondCycleFullDisplayRangeFallback,
} from '@/components/admin/payoutSecondCycleDisplayRange';

describe('resolvePayoutCycleDisplayRange', () => {
  it('keeps FIRST payout on its 15-day window', () => {
    expect(
      resolvePayoutCycleDisplayRange({
        cycleStage: 'FIRST',
        cycleFrom: '2026-09-06',
        periodFrom: '2026-09-06',
        periodTo: '2026-09-20',
        periodDays: 15,
      }),
    ).toEqual({
      displayFrom: '2026-09-06',
      displayTo: '2026-09-20',
      displayDays: 15,
    });
  });

  it('shows SECOND payout as the full 30-day cycle from the first payout start', () => {
    expect(
      resolvePayoutCycleDisplayRange({
        cycleStage: 'SECOND',
        cycleFrom: '2026-09-06',
        periodFrom: '2026-09-21',
        periodTo: '2026-10-05',
        periodDays: 15,
      }),
    ).toEqual({
      displayFrom: '2026-09-06',
      displayTo: '2026-10-05',
      displayDays: FULL_CYCLE_INCLUSIVE_DAYS,
    });
  });

  it('falls back to 30 inclusive days ending at the second window when cycleFrom is missing', () => {
    expect(
      resolvePayoutCycleDisplayRange({
        cycleStage: 'SECOND',
        periodFrom: '2026-09-21',
        periodTo: '2026-10-05',
        periodDays: 15,
      }),
    ).toEqual({
      displayFrom: '2026-09-06',
      displayTo: '2026-10-05',
      displayDays: 30,
    });
  });

  it('ignores cycleFrom that is not before the second window', () => {
    expect(
      resolvePayoutCycleDisplayRange({
        cycleStage: 'SECOND',
        cycleFrom: '2026-09-21',
        periodFrom: '2026-09-21',
        periodTo: '2026-10-05',
        periodDays: 15,
      }),
    ).toEqual({
      displayFrom: '2026-09-06',
      displayTo: '2026-10-05',
      displayDays: 30,
    });
  });
});

describe('resolveSecondCycleFullDisplayRange', () => {
  it('spans from the paired first window start through the second window end', () => {
    const rows = [
      { periodFrom: '2026-09-06', periodTo: '2026-09-20' },
      { periodFrom: '2026-09-21', periodTo: '2026-10-05' },
    ];
    expect(resolveSecondCycleFullDisplayRange(rows, rows[1])).toEqual({
      displayFrom: '2026-09-06',
      displayTo: '2026-10-05',
    });
  });
});

describe('secondCycleFullDisplayRangeFallback', () => {
  it('counts 30 inclusive days ending on the second window', () => {
    expect(secondCycleFullDisplayRangeFallback({ periodTo: '2026-10-05' })).toEqual({
      displayFrom: '2026-09-06',
      displayTo: '2026-10-05',
    });
  });
});
