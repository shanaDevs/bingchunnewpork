import { describe, expect, it } from 'vitest';
import { resolveSellableQty } from '../../src/lib/batchStockEngine';

describe('validateOrderStock channel rules', () => {
  const avail = {
    onHand: 10,
    reserved: 0,
    onlineAvailable: 5,
    counterAvailable: 10,
    isLowStock: false,
    isOnlineOutOfStock: false,
    isCounterOutOfStock: false,
    thresholds: { lowStockThreshold: 25, onlineOutOfStockThreshold: 5 },
  };

  it('online channel uses onlineAvailable (excludes buffer)', () => {
    expect(resolveSellableQty(avail, 'WEB')).toBe(5);
  });

  it('counter channel uses counterAvailable (includes buffer)', () => {
    expect(resolveSellableQty(avail, 'POS')).toBe(10);
  });

  it('aggregates line quantities against sellable cap', () => {
    const lines = [
      { quantity: 3 },
      { quantity: 4 },
    ];
    const total = lines.reduce((sum, l) => sum + l.quantity, 0);
    expect(total).toBeGreaterThan(resolveSellableQty(avail, 'WEB'));
  });
});
