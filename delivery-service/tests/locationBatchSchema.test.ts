import { describe, expect, it } from 'vitest';
import { locationBatchSchema } from '../src/schemas/locationBatch';

describe('locationBatchSchema', () => {
  it('accepts a single valid point', () => {
    const parsed = locationBatchSchema.parse([{ lat: 6.9, lng: 79.8 }]);
    expect(parsed).toHaveLength(1);
  });

  it('rejects empty batch', () => {
    expect(() => locationBatchSchema.parse([])).toThrow();
  });

  it('rejects more than 200 points', () => {
    const batch = Array.from({ length: 201 }, () => ({ lat: 1, lng: 2 }));
    expect(() => locationBatchSchema.parse(batch)).toThrow();
  });

  it('rejects non-numeric lat', () => {
    expect(() => locationBatchSchema.parse([{ lat: 'bad', lng: 1 }])).toThrow();
  });
});
