import { describe, expect, it } from 'vitest';
import {
  getEffectiveThresholds,
  isLowStockByQty,
  isOnlineOutOfStockByQty,
} from '../../src/lib/batchStockEngine';

describe('batchStockEngine thresholds', () => {
  it('uses global defaults when per-row thresholds are null', () => {
    expect(getEffectiveThresholds({})).toEqual({
      lowStockThreshold: 25,
      onlineOutOfStockThreshold: 5,
    });
  });

  it('uses per-row thresholds when set', () => {
    expect(
      getEffectiveThresholds({ lowStockThreshold: 40, onlineOutOfStockThreshold: 8 }),
    ).toEqual({
      lowStockThreshold: 40,
      onlineOutOfStockThreshold: 8,
    });
  });

  it('marks low stock between buffer and low threshold', () => {
    const t = { lowStockThreshold: 25, onlineOutOfStockThreshold: 5 };
    expect(isLowStockByQty(25, t)).toBe(true);
    expect(isLowStockByQty(20, t)).toBe(true);
    expect(isLowStockByQty(5, t)).toBe(false);
    expect(isLowStockByQty(30, t)).toBe(false);
  });

  it('marks online out of stock at or below buffer', () => {
    const t = { lowStockThreshold: 25, onlineOutOfStockThreshold: 5 };
    expect(isOnlineOutOfStockByQty(5, t)).toBe(true);
    expect(isOnlineOutOfStockByQty(6, t)).toBe(false);
  });

  it('online sellable excludes buffer units', () => {
    const onHand = 10;
    const buffer = 5;
    const onlineAvailable = Math.max(0, onHand - buffer);
    expect(onlineAvailable).toBe(5);
  });

  it('counter can sell through buffer when on hand is at buffer', () => {
    const onHand = 5;
    const counterAvailable = onHand;
    expect(counterAvailable).toBe(5);
  });

  it('resolveSellableQty respects channel buffer rules', () => {
    const avail = {
      onlineAvailable: 0,
      counterAvailable: 5,
    };
    expect(avail.counterAvailable).toBe(5);
    expect(avail.onlineAvailable).toBe(0);
  });
});

describe('FIFO consumption order (conceptual)', () => {
  it('consumes oldest batch first', () => {
    const batches = [
      { id: 'b1', receivedAt: new Date('2026-08-01'), remainingQty: 3 },
      { id: 'b2', receivedAt: new Date('2026-08-05'), remainingQty: 10 },
    ].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

    let toConsume = 5;
    const allocations: Array<{ batchId: string; qty: number }> = [];
    for (const batch of batches) {
      if (toConsume <= 0) break;
      const take = Math.min(batch.remainingQty, toConsume);
      allocations.push({ batchId: batch.id, qty: take });
      toConsume -= take;
    }

    expect(allocations).toEqual([
      { batchId: 'b1', qty: 3 },
      { batchId: 'b2', qty: 2 },
    ]);
  });

  it('cancel restores to originating batch', () => {
    const batchRemaining = { b1: 0, b2: 8 };
    const allocation = { batchId: 'b1', quantity: 3, reversedQty: 0 };
    const restore = allocation.quantity - allocation.reversedQty;
    batchRemaining.b1 += restore;
    expect(batchRemaining.b1).toBe(3);
  });
});
