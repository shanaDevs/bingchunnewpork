import { describe, expect, it } from 'vitest';
import { clampMeritPoints, meritStatusBand, MERIT_DELTAS, RECOVERY_STREAK } from '../../src/lib/meritPoints';
import { isRejectAllowed } from '../../src/lib/deliveryJobHelpers';

describe('meritStatusBand', () => {
  it('maps the documented ranges', () => {
    expect(meritStatusBand(100)).toBe('EXCELLENT');
    expect(meritStatusBand(90)).toBe('EXCELLENT');
    expect(meritStatusBand(89)).toBe('GOOD');
    expect(meritStatusBand(75)).toBe('GOOD');
    expect(meritStatusBand(74)).toBe('AVERAGE');
    expect(meritStatusBand(60)).toBe('AVERAGE');
    expect(meritStatusBand(59)).toBe('WARNING');
    expect(meritStatusBand(40)).toBe('WARNING');
    expect(meritStatusBand(39)).toBe('CRITICAL');
    expect(meritStatusBand(0)).toBe('CRITICAL');
  });
});

describe('clampMeritPoints', () => {
  it('never exceeds 100 or goes below 0', () => {
    expect(clampMeritPoints(105)).toBe(100);
    expect(clampMeritPoints(-4)).toBe(0);
    expect(clampMeritPoints(97)).toBe(97);
  });

  it('applies documented deltas without leaving the range', () => {
    expect(clampMeritPoints(100 + MERIT_DELTAS.CANCEL_BEFORE_PICKUP)).toBe(95);
    expect(clampMeritPoints(1 + MERIT_DELTAS.SERIOUS_VIOLATION)).toBe(0);
    expect(clampMeritPoints(98 + MERIT_DELTAS.RECOVERY_BONUS)).toBe(100);
  });

  it('recovery streak is 20', () => {
    expect(RECOVERY_STREAK).toBe(20);
  });
});

describe('isRejectAllowed', () => {
  it('allows reject before pickup', () => {
    expect(isRejectAllowed(['ASSIGNED'])).toBe(true);
    expect(isRejectAllowed([])).toBe(true);
  });

  it('blocks reject after pickup', () => {
    expect(isRejectAllowed(['ASSIGNED', 'PICKED_UP'])).toBe(false);
    expect(isRejectAllowed(['EN_ROUTE'])).toBe(false);
    expect(isRejectAllowed(['DELIVERED'])).toBe(false);
  });
});
