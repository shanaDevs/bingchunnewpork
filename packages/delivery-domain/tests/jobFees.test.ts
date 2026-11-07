import { describe, expect, it } from 'vitest';
import { lkrWholeToJobFeeDecimal } from '../src/jobFees';

/** Mirrors backend `decimalToLkrString` for delivery job fees. */
function decimalToLkrString(cents: { toFixed: (d: number) => string }): string {
  const n = Number(cents.toFixed(0));
  return String(Math.round(n / 100));
}

describe('lkrWholeToJobFeeDecimal', () => {
  it('stores 150 LKR as 15000 cents so API serialization yields 150 not 2', () => {
    const stored = lkrWholeToJobFeeDecimal(150);
    expect(stored.toFixed(0)).toBe('15000');
    expect(decimalToLkrString(stored)).toBe('150');
  });

  it('rejects non-finite LKR', () => {
    expect(() => lkrWholeToJobFeeDecimal(Number.NaN)).toThrow(/invalid/i);
  });
});
