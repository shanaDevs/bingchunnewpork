import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';
import {
  defaultColomboMonthDayStrings,
  resolveReportDayRange,
} from '../../src/lib/reportQueryRange';

describe('reportQueryRange', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to the current calendar month in Colombo', () => {
    expect(defaultColomboMonthDayStrings()).toEqual({ from: '2026-07-01', to: '2026-07-22' });
    const range = resolveReportDayRange();
    expect(range.from).toBe('2026-07-01');
    expect(range.to).toBe('2026-07-22');
    expect(range.gte.getTime()).toBeLessThan(range.lte.getTime());
  });

  it('honours explicit from/to within max span', () => {
    const range = resolveReportDayRange('2026-07-01', '2026-07-15');
    expect(range.from).toBe('2026-07-01');
    expect(range.to).toBe('2026-07-15');
  });

  it('rejects spans wider than 92 days', () => {
    expect(() => resolveReportDayRange('2026-01-01', '2026-05-01')).toThrow(AppError);
  });
});
