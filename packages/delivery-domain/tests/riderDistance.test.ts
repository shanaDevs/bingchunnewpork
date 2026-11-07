import { describe, expect, it } from 'vitest';
import {
  jobRiderDistanceKm,
  roundDistanceKm,
  sumRiderDistanceKm,
} from '../src/riderDistance';

describe('jobRiderDistanceKm', () => {
  it('prefers actual GPS distance over planned total', () => {
    expect(
      jobRiderDistanceKm({ actualDistanceKm: 12.4, totalDistanceKm: 8.0 }),
    ).toBe(12.4);
  });

  it('falls back to total when actual is null', () => {
    expect(jobRiderDistanceKm({ actualDistanceKm: null, totalDistanceKm: 5.5 })).toBe(5.5);
  });

  it('returns 0 when both are missing', () => {
    expect(jobRiderDistanceKm({})).toBe(0);
  });
});

describe('sumRiderDistanceKm', () => {
  it('sums driven km for completed jobs (actual preferred)', () => {
    const completed = [
      { actualDistanceKm: 10, totalDistanceKm: 6 },
      { actualDistanceKm: null, totalDistanceKm: 3.2 },
    ];
    expect(sumRiderDistanceKm(completed)).toBeCloseTo(13.2);
  });

  it('callers must omit cancelled jobs before summing for admin/rider KPI parity', () => {
    const completedOnly = [{ actualDistanceKm: 8, totalDistanceKm: 5 }];
    const wronglyIncludingCancelled = [
      ...completedOnly,
      { actualDistanceKm: null, totalDistanceKm: 40 },
    ];
    expect(sumRiderDistanceKm(completedOnly)).toBe(8);
    expect(sumRiderDistanceKm(wronglyIncludingCancelled)).toBe(48);
  });
});

describe('roundDistanceKm', () => {
  it('rounds to one decimal place', () => {
    expect(roundDistanceKm(12.34)).toBe(12.3);
    expect(roundDistanceKm(12.35)).toBe(12.4);
  });
});
