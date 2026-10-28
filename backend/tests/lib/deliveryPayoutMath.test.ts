import { describe, expect, it } from 'vitest';
import {
  businessDayEndUtc,
  businessDayStartUtc,
  DELIVERY_PAYOUT_PERIOD_DAYS,
  minDateStr,
  nextPeriodStartFromPeriodTo,
  resolveLiveDeliveryWalletRange,
  toBusinessDateStr,
  todayUtcDateStr,
  validateDeliveryPayoutRange,
  yesterdayUtcDateStr,
} from '../../src/lib/deliveryPayoutMath';

describe('DELIVERY_PAYOUT_PERIOD_DAYS', () => {
  it('allows only 15-day payout periods', () => {
    expect(DELIVERY_PAYOUT_PERIOD_DAYS).toEqual([15]);
  });
});

describe('validateDeliveryPayoutRange', () => {
  const today = '2026-08-28';

  it('rejects end date of today', () => {
    const result = validateDeliveryPayoutRange({
      from: '2026-08-01',
      to: '2026-08-28',
      today,
      nextPeriodStart: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/before today/i);
  });

  it('rejects a future end date', () => {
    const result = validateDeliveryPayoutRange({
      from: '2026-08-01',
      to: '2026-08-29',
      today,
      nextPeriodStart: null,
    });
    expect(result.ok).toBe(false);
  });

  it('allows yesterday as the end date', () => {
    expect(
      validateDeliveryPayoutRange({
        from: '2026-08-01',
        to: '2026-08-27',
        today,
        nextPeriodStart: null,
      }),
    ).toEqual({ ok: true });
  });

  it('rejects from after to', () => {
    const result = validateDeliveryPayoutRange({
      from: '2026-08-20',
      to: '2026-08-10',
      today,
      nextPeriodStart: null,
    });
    expect(result.ok).toBe(false);
  });

  it('requires from to match nextPeriodStart when a prior payout exists', () => {
    const mismatch = validateDeliveryPayoutRange({
      from: '2026-08-01',
      to: '2026-08-27',
      today,
      nextPeriodStart: '2026-08-15',
    });
    expect(mismatch.ok).toBe(false);

    expect(
      validateDeliveryPayoutRange({
        from: '2026-08-15',
        to: '2026-08-27',
        today,
        nextPeriodStart: '2026-08-15',
      }),
    ).toEqual({ ok: true });
  });
});

describe('nextPeriodStartFromPeriodTo', () => {
  it('returns the day after period end', () => {
    expect(nextPeriodStartFromPeriodTo(new Date('2026-08-27T23:59:59.999Z'))).toBe('2026-08-28');
    expect(nextPeriodStartFromPeriodTo('2026-08-27')).toBe('2026-08-28');
  });
});

describe('resolveLiveDeliveryWalletRange', () => {
  const today = '2026-09-07';

  it('starts the day after the last approved payout through today', () => {
    expect(
      resolveLiveDeliveryWalletRange({
        lastApprovedPeriodTo: '2026-08-27',
        earliestFeeDate: '2026-03-01',
        today,
      }),
    ).toEqual({ from: '2026-08-28', to: today });
  });

  it('falls back to the first fee date when nothing is approved', () => {
    expect(
      resolveLiveDeliveryWalletRange({
        lastApprovedPeriodTo: null,
        earliestFeeDate: '2026-03-01',
        today,
      }),
    ).toEqual({ from: '2026-03-01', to: today });
  });

  it('keeps live through today after the last approved period', () => {
    const today = '2026-09-09';
    expect(
      resolveLiveDeliveryWalletRange({
        lastApprovedPeriodTo: '2026-08-25',
        earliestFeeDate: '2026-03-01',
        today,
      }),
    ).toEqual({ from: '2026-08-26', to: today });
  });

  it('is empty when there is no start or the start is after today', () => {
    expect(
      resolveLiveDeliveryWalletRange({
        lastApprovedPeriodTo: null,
        earliestFeeDate: null,
        today,
      }),
    ).toBeNull();
    expect(
      resolveLiveDeliveryWalletRange({
        lastApprovedPeriodTo: today,
        earliestFeeDate: '2026-03-01',
        today,
      }),
    ).toBeNull();
  });
});

describe('yesterdayUtcDateStr', () => {
  it('is the day before today', () => {
    expect(yesterdayUtcDateStr('2026-08-28')).toBe('2026-08-27');
  });
});

describe('Asia/Colombo civil days', () => {
  it('keeps 06:00 Sri Lanka time on the same calendar day as midnight Colombo', () => {
    const justBeforeColomboMidnight = new Date('2026-09-07T18:29:59.000Z');
    const colomboMidnight = new Date('2026-09-07T18:30:00.000Z');
    expect(toBusinessDateStr(justBeforeColomboMidnight)).toBe('2026-09-07');
    expect(toBusinessDateStr(colomboMidnight)).toBe('2026-09-08');
    expect(todayUtcDateStr(colomboMidnight)).toBe('2026-09-08');
  });

  it('filters order createdAt with Colombo day bounds', () => {
    expect(businessDayStartUtc('2026-09-08').toISOString()).toBe('2026-09-07T18:30:00.000Z');
    expect(businessDayEndUtc('2026-09-08').toISOString()).toBe('2026-09-08T18:29:59.999Z');
  });
});

describe('minDateStr', () => {
  it('returns the earliest YYYY-MM-DD and ignores empty values', () => {
    expect(minDateStr(['2026-08-20', null, '2026-03-01', undefined])).toBe('2026-03-01');
  });

  it('returns null when there are no valid dates', () => {
    expect(minDateStr([null, undefined, ''])).toBeNull();
  });
});
