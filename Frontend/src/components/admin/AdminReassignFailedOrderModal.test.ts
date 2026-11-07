import { describe, expect, it } from 'vitest';
import { filterRankedDriversBySearch } from './AdminReassignFailedOrderModal';

const sample = [
  { driverId: '1', name: 'Alice Kumar', storeName: 'Colombo' },
  { driverId: '2', name: 'Bob Perera', storeName: 'Kandy' },
  { driverId: '3', name: 'Charlie', storeName: null },
];

describe('filterRankedDriversBySearch', () => {
  it('returns all drivers when query is empty or whitespace', () => {
    expect(filterRankedDriversBySearch(sample, '')).toEqual(sample);
    expect(filterRankedDriversBySearch(sample, '   ')).toEqual(sample);
  });

  it('matches rider names case-insensitively', () => {
    expect(filterRankedDriversBySearch(sample, 'alice')).toEqual([sample[0]]);
    expect(filterRankedDriversBySearch(sample, 'PERERA')).toEqual([sample[1]]);
  });

  it('matches store name when present', () => {
    expect(filterRankedDriversBySearch(sample, 'kandy')).toEqual([sample[1]]);
  });

  it('returns empty array when nothing matches', () => {
    expect(filterRankedDriversBySearch(sample, 'zzzzz')).toEqual([]);
  });
});
