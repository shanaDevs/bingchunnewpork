import { describe, expect, it } from 'vitest';
import {
  centsStringToNumber,
  formatCentsStringAsLkr,
  normalizeStoreWalletFromApi,
  normalizeWalletSummaryFromApi,
  normalizeWithdrawalFromApi,
  parseCentsString,
  parseLkrString,
} from './moneyString';

describe('moneyString cents parsing', () => {
  it('parses integer cent strings and numbers', () => {
    expect(parseCentsString('150050')).toBe(150050n);
    expect(parseCentsString(99)).toBe(99n);
    expect(parseCentsString(null)).toBe(0n);
    expect(parseCentsString('not-cents')).toBe(0n);
  });

  it('converts cents strings to numbers within safe integer range', () => {
    expect(centsStringToNumber('150050')).toBe(150050);
  });

  it('formats cent strings as LKR with two decimal places', () => {
    expect(formatCentsStringAsLkr('150050')).toMatch(/1,500\.50$/);
    expect(formatCentsStringAsLkr('-1050')).toMatch(/-10\.50$/);
  });

  it('parses LKR display strings for legacy inputs', () => {
    expect(parseLkrString('12.5')).toBe(12.5);
    expect(parseLkrString('')).toBe(0);
  });
});

describe('moneyString API normalization', () => {
  it('normalizes store wallet cent strings to numbers', () => {
    const row = normalizeStoreWalletFromApi({
      storeId: 's1',
      balance: '100000',
      totalEarnings: '200000',
      totalWithdrawn: '50000',
      availableBalance: '80000',
    });
    expect(row.balance).toBe(100000);
    expect(row.currentBalance).toBe(100000);
    expect(row.availableBalance).toBe(80000);
  });

  it('normalizes wallet summary fields when present', () => {
    const summary = normalizeWalletSummaryFromApi({
      storeId: 's1',
      currentBalance: '100',
      pendingWithdrawalTotal: '25',
    });
    expect(summary.currentBalance).toBe(100);
    expect(summary.pendingWithdrawalTotal).toBe(25);
    expect(summary).not.toHaveProperty('totalEarnings');
  });

  it('normalizes withdrawal amount', () => {
    expect(normalizeWithdrawalFromApi({ id: 'w1', amount: '9999' }).amount).toBe(9999);
  });
});
