import { describe, expect, it } from 'vitest';
import { branchStockFromRow } from '../../src/lib/menuBranchStock';

const baseRow = {
  stock: 30,
  weeklyBaseQty: 40,
  weeklyRemainingQty: 99,
  isAvailable: true,
  onlineOutOfStockThreshold: 10,
  lowStockThreshold: 25,
};

describe('branchStockFromRow', () => {
  it('uses stock minus reserved minus per-product OOS threshold, not weeklyRemainingQty - 5', () => {
    const meta = branchStockFromRow(baseRow, 3);
    expect(meta.quantity).toBe(17);
    expect(meta.inStock).toBe(true);
    expect(meta.isOutOfStock).toBe(false);
    expect(meta.isComingSoon).toBe(false);
  });

  it('does not treat weeklyRemainingQty - 5 as sellable when stock and threshold differ', () => {
    const wrongLegacyQty = baseRow.weeklyRemainingQty - 5;
    const meta = branchStockFromRow(baseRow, 3);
    expect(meta.quantity).not.toBe(wrongLegacyQty);
    expect(meta.quantity).toBe(baseRow.stock - 3 - 10);
  });

  it('marks out of stock when nothing is left online after buffer and reservations', () => {
    const meta = branchStockFromRow(
      { ...baseRow, stock: 12, weeklyRemainingQty: 12 },
      2,
    );
    expect(meta.quantity).toBe(0);
    expect(meta.inStock).toBe(false);
    expect(meta.isOutOfStock).toBe(true);
    expect(meta.isLowStock).toBe(false);
  });

  it('flags low stock from online-available qty', () => {
    const meta = branchStockFromRow(
      { ...baseRow, stock: 30, weeklyRemainingQty: 30, lowStockThreshold: 25 },
      0,
    );
    expect(meta.quantity).toBe(20);
    expect(meta.isLowStock).toBe(true);
    expect(meta.inStock).toBe(true);
  });

  it('uses default buffer of 5 when per-product threshold is null', () => {
    const meta = branchStockFromRow(
      {
        ...baseRow,
        stock: 20,
        weeklyRemainingQty: 20,
        onlineOutOfStockThreshold: null,
      },
      0,
    );
    expect(meta.quantity).toBe(15);
  });

  it('treats weeklyBaseQty 0 with no on-hand stock and no batch history as coming soon', () => {
    const meta = branchStockFromRow({ ...baseRow, weeklyBaseQty: 0, stock: 0, weeklyRemainingQty: 0 }, 0);
    expect(meta.isComingSoon).toBe(true);
    expect(meta.quantity).toBe(0);
    expect(meta.inStock).toBe(false);
    expect(meta.isOutOfStock).toBe(false);
  });

  it('shows out of stock when stock was received before but is now depleted', () => {
    const meta = branchStockFromRow(
      {
        ...baseRow,
        weeklyBaseQty: 0,
        stock: 0,
        weeklyRemainingQty: 0,
        totalBatchCount: 2,
        weeklyReceivedQty: 40,
      },
      0,
    );
    expect(meta.isComingSoon).toBe(false);
    expect(meta.isOutOfStock).toBe(true);
    expect(meta.inStock).toBe(false);
  });

  it('shows out of stock when weekly target was configured but stock is depleted', () => {
    const meta = branchStockFromRow(
      {
        ...baseRow,
        weeklyBaseQty: 0,
        weeklyTargetQty: 50,
        stock: 0,
        weeklyRemainingQty: 0,
      },
      0,
    );
    expect(meta.isComingSoon).toBe(false);
    expect(meta.isOutOfStock).toBe(true);
  });

  it('does not mark coming soon when weeklyBaseQty is 0 but on-hand stock remains', () => {
    const meta = branchStockFromRow(
      {
        ...baseRow,
        weeklyBaseQty: 0,
        stock: 22,
        weeklyRemainingQty: 22,
        onlineOutOfStockThreshold: 5,
      },
      0,
    );
    expect(meta.isComingSoon).toBe(false);
    expect(meta.quantity).toBe(17);
    expect(meta.inStock).toBe(true);
  });

  it('returns no stock when the branch row is missing', () => {
    const meta = branchStockFromRow(undefined);
    expect(meta.quantity).toBe(0);
    expect(meta.inStock).toBe(false);
    expect(meta.isOutOfStock).toBe(true);
  });
});
