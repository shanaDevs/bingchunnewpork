import { describe, expect, it } from 'vitest';
import { fixSwappedSriLankaCoordinates, haversineKm, NEARBY_BRANCH_RADIUS_KM } from '../../src/utils/geo';

describe('fixSwappedSriLankaCoordinates', () => {
  it('swaps lat/lng when they are reversed for Sri Lanka', () => {
    expect(fixSwappedSriLankaCoordinates(79.8952, 6.878)).toEqual({ lat: 6.878, lng: 79.8952 });
  });

  it('leaves correct coordinates unchanged', () => {
    expect(fixSwappedSriLankaCoordinates(6.878, 79.8952)).toEqual({ lat: 6.878, lng: 79.8952 });
  });
});

describe('NEARBY_BRANCH_RADIUS_KM', () => {
  it('is 7 km', () => {
    expect(NEARBY_BRANCH_RADIUS_KM).toBe(7);
  });
});

describe('haversineKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineKm(6.9271, 79.8612, 6.9271, 79.8612)).toBe(0);
  });

  it('computes a positive distance between two distinct points', () => {
    const distance = haversineKm(6.9271, 79.8612, 6.8726, 79.8897);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(20);
  });

  it('is symmetric regardless of point order', () => {
    const forward = haversineKm(6.9271, 79.8612, 6.8726, 79.8897);
    const reverse = haversineKm(6.8726, 79.8897, 6.9271, 79.8612);
    expect(forward).toBeCloseTo(reverse, 10);
  });

  it('returns a distance within nearby branch radius for close Colombo points', () => {
    const distance = haversineKm(6.9271, 79.8612, 6.9022, 79.8551);
    expect(distance).toBeLessThan(NEARBY_BRANCH_RADIUS_KM);
  });
});
