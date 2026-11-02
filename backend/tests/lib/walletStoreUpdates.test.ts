import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  parseLockedStoreWallet,
  walletDataAfterBalanceDelta,
  walletDataAfterDebit,
} from '../../src/lib/walletStoreUpdates';

describe('walletStoreUpdates', () => {
  it('parses locked wallet decimals from DB-like values', () => {
    const locked = parseLockedStoreWallet({
      balance: new Prisma.Decimal('100000'),
      totalWithdrawn: new Prisma.Decimal('20000'),
    });
    expect(locked.balance.toFixed(0)).toBe('100000');
    expect(locked.totalWithdrawn.toFixed(0)).toBe('20000');
  });

  it('applies debit to balance and totalWithdrawn', () => {
    const locked = parseLockedStoreWallet({
      balance: '100000',
      totalWithdrawn: '20000',
    });
    const after = walletDataAfterDebit(locked, 5000);
    expect(after.balance.toFixed(0)).toBe('95000');
    expect(after.totalWithdrawn.toFixed(0)).toBe('25000');
  });

  it('applies balance delta with optional earnings and withdrawn deltas', () => {
    const current = {
      totalEarnings: new Prisma.Decimal('50000'),
      totalWithdrawn: new Prisma.Decimal('10000'),
    };
    const after = walletDataAfterBalanceDelta(
      new Prisma.Decimal('40000'),
      2000,
      { earningsDeltaCents: 2000, withdrawnDeltaCents: 1000 },
      current,
    );
    expect(after.balance.toFixed(0)).toBe('42000');
    expect(after.totalEarnings?.toFixed(0)).toBe('52000');
    expect(after.totalWithdrawn?.toFixed(0)).toBe('11000');
  });
});
