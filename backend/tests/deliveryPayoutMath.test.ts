import { describe, expect, it } from 'vitest';
import {
  DELIVERY_PAYOUT_ELAPSED_DAYS,
  resolveOpenCycleLiveWalletRange,
  resolveOpenDeliveryPayoutWindow,
} from '../src/lib/deliveryPayoutMath';

describe('delivery payout 30-day windows', () => {
  it('uses a 30-day elapsed cycle', () => {
    expect(DELIVERY_PAYOUT_ELAPSED_DAYS).toBe(30);
  });

  it('keeps the open cycle until the 30th day', () => {
    const open = resolveOpenDeliveryPayoutWindow({
      periodStart: '2026-10-01',
      days: 30,
      today: '2026-10-16',
    });
    expect(open).toEqual({
      days: 30,
      from: '2026-10-01',
      cycleTo: '2026-10-30',
      through: '2026-10-16',
      capped: true,
    });
  });

  it('advances to the next 30-day window after the cycle closes', () => {
    const open = resolveOpenDeliveryPayoutWindow({
      periodStart: '2026-10-01',
      days: 30,
      today: '2026-10-31',
    });
    expect(open).toMatchObject({
      days: 30,
      from: '2026-10-31',
      cycleTo: '2026-11-29',
      through: '2026-10-31',
    });
  });

  it('live wallet range is the open cycle, not unpaid due windows after last paid', () => {
    const live = resolveOpenCycleLiveWalletRange({
      periodStart: '2026-09-22',
      today: '2026-11-17',
    });
    expect(live).toEqual({ from: '2026-10-22', to: '2026-11-17' });
  });
});
