import { describe, expect, it } from 'vitest';
import {
  createdAtRangeFromDateStrings,
  endOfDayColombo,
  periodRange,
  startOfDayColombo,
} from '../../src/lib/dashboardStatsDateRange';

describe('periodRange', () => {
  it('uses Colombo calendar days for preset periods', () => {
    const now = new Date('2026-10-30T06:30:00.000Z'); // 12:00 in Colombo
    expect(periodRange('today', now)).toEqual({
      gte: startOfDayColombo('2026-10-30'),
      lte: endOfDayColombo('2026-10-30'),
    });
    expect(periodRange('month', now)).toEqual({
      gte: startOfDayColombo('2026-10-01'),
      lte: endOfDayColombo('2026-10-30'),
    });
  });
});

describe('createdAtRangeFromDateStrings', () => {
  it('parses admin order list date filters in Colombo', () => {
    expect(createdAtRangeFromDateStrings('2026-07-01', '2026-07-22')).toEqual({
      gte: startOfDayColombo('2026-07-01'),
      lte: endOfDayColombo('2026-07-22'),
    });
  });
});
