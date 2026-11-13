import { describe, expect, it } from 'vitest';
import { branchStockFromRow, isNeverStockedAtBranch } from '../../src/lib/menuBranchStock';

describe('isNeverStockedAtBranch', () => {
  it('is true for catalog rows with no on-hand and no batch history', () => {
    expect(
      isNeverStockedAtBranch({
        stock: 0,
        weeklyBaseQty: 0,
        weeklyRemainingQty: 0,
        weeklyTargetQty: 80,
        isAvailable: false,
        totalBatchCount: 0,
      }),
    ).toBe(true);
  });

  it('is false after any batch exists even when on-hand is zero', () => {
    expect(
      isNeverStockedAtBranch({
        stock: 0,
        weeklyBaseQty: 0,
        weeklyRemainingQty: 0,
        weeklyTargetQty: 80,
        isAvailable: true,
        totalBatchCount: 2,
      }),
    ).toBe(false);
  });
});

describe('branchStockFromRow', () => {
  it('marks never-stocked branch rows as coming soon, not out of stock', () => {
    const meta = branchStockFromRow({
      stock: 0,
      weeklyBaseQty: 0,
      weeklyRemainingQty: 0,
      weeklyTargetQty: 80,
      isAvailable: false,
      totalBatchCount: 0,
    });

    expect(meta.isComingSoon).toBe(true);
    expect(meta.isOutOfStock).toBe(false);
    expect(meta.inStock).toBe(false);
  });
});
