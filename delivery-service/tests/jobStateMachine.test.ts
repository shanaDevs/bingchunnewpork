import { describe, expect, it } from 'vitest';
import {
  canTransitionJob,
  clampMeritPoints,
  isRejectAllowed,
  meritStatusBand,
} from '@bingchun/delivery-domain';

describe('canTransitionJob', () => {
  it('allows SCHEDULED → ASSIGNED', () => {
    expect(canTransitionJob('SCHEDULED', 'ASSIGNED')).toBe(true);
  });

  it('blocks COMPLETED → IN_PROGRESS', () => {
    expect(canTransitionJob('COMPLETED', 'IN_PROGRESS')).toBe(false);
  });

  it('allows IN_PROGRESS → RETURNING', () => {
    expect(canTransitionJob('IN_PROGRESS', 'RETURNING')).toBe(true);
  });
});

describe('isRejectAllowed', () => {
  it('allows reject before pickup', () => {
    expect(isRejectAllowed(['PENDING_ASSIGNMENT', 'ASSIGNED'])).toBe(true);
  });

  it('blocks reject after pickup', () => {
    expect(isRejectAllowed(['PICKED_UP'])).toBe(false);
  });
});

describe('merit helpers', () => {
  it('clamps merit to 0–100', () => {
    expect(clampMeritPoints(-5)).toBe(0);
    expect(clampMeritPoints(150)).toBe(100);
  });

  it('maps bands', () => {
    expect(meritStatusBand(95)).toBe('EXCELLENT');
    expect(meritStatusBand(30)).toBe('CRITICAL');
  });
});
