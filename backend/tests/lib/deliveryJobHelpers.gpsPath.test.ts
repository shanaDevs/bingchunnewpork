import { describe, expect, it } from 'vitest';
import { parseActualRouteJson, simplifyGpsPath } from '../../src/lib/deliveryJobHelpers';

describe('parseActualRouteJson', () => {
  it('parses array-of-arrays route JSON', () => {
    expect(parseActualRouteJson(JSON.stringify([[6.9, 79.8], [6.91, 79.81]]))).toEqual([
      { lat: 6.9, lng: 79.8 },
      { lat: 6.91, lng: 79.81 },
    ]);
  });

  it('parses array-of-objects route JSON', () => {
    expect(parseActualRouteJson(JSON.stringify([{ lat: 6.9, lng: 79.8 }]))).toEqual([
      { lat: 6.9, lng: 79.8 },
    ]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseActualRouteJson('not-json')).toEqual([]);
    expect(parseActualRouteJson(null)).toEqual([]);
  });
});

describe('simplifyGpsPath', () => {
  it('returns short paths unchanged', () => {
    const path = [
      { lat: 6.9, lng: 79.8 },
      { lat: 6.91, lng: 79.81 },
    ];
    expect(simplifyGpsPath(path)).toEqual(path);
  });

  it('simplifies very long paths', () => {
    const path = Array.from({ length: 600 }, (_, i) => ({
      lat: 6.9 + i * 0.0001,
      lng: 79.8 + i * 0.0001,
    }));
    const simplified = simplifyGpsPath(path);
    expect(simplified.length).toBeLessThan(path.length);
    expect(simplified[0]).toEqual(path[0]);
    expect(simplified[simplified.length - 1]).toEqual(path[path.length - 1]);
  });
});
