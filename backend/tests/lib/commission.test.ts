import { describe, expect, it } from 'vitest';
import {
  accumulateSettlementBreakdown,
  DEFAULT_COMMISSION_SLABS,
  computePlatformCommission,
  getEffectiveRate,
  getSlabIndex,
  orderCommissionChannel,
  sumBreakdownOrderCount,
  sumOnlinePaymentsCollectedFromBreakdown,
} from '../../src/lib/commission';

const CUSTOM_SLABS = [
  { upTo: 500_000, rate: 0.07, label: 'Up to LKR 500,000' },
  { upTo: Infinity, rate: 0.04, label: 'Above LKR 500,000' },
] as const;

describe('commission tier boundaries (default 2-tier)', () => {
  it('uses 6.5% up to 1M', () => {
    expect(getSlabIndex(1_000_000)).toBe(0);
    expect(getEffectiveRate(1_000_000)).toBe(0.065);
    expect(computePlatformCommission(100_000, 1_000_000)).toBe(6_500);
  });

  it('uses 5% above 1M', () => {
    expect(getSlabIndex(1_000_001)).toBe(1);
    expect(getEffectiveRate(2_000_000)).toBe(0.05);
    expect(computePlatformCommission(100_000, 2_000_000)).toBe(5_000);
  });

  it('exposes default slab labels', () => {
    expect(DEFAULT_COMMISSION_SLABS[0].label).toContain('1,000,000');
    expect(DEFAULT_COMMISSION_SLABS[1].label).toContain('Above');
  });
});

describe('custom commission slabs', () => {
  it('applies custom threshold and rates', () => {
    expect(getEffectiveRate(500_000, CUSTOM_SLABS)).toBe(0.07);
    expect(getEffectiveRate(500_001, CUSTOM_SLABS)).toBe(0.04);
    expect(computePlatformCommission(100_000, 600_000, CUSTOM_SLABS)).toBe(4_000);
  });

  it('uses custom slabs in settlement breakdown', () => {
    const createdAt = new Date('2026-08-23T00:00:00.000Z');
    const breakdown = accumulateSettlementBreakdown(
      [
        {
          subtotal: 200_000,
          discount: 0,
          loyaltyDiscount: 0,
          total: 200_000,
          orderMode: 'TAKEAWAY',
          paymentMethod: 'CASH_AT_COUNTER',
          createdAt,
        },
      ],
      600_000,
      undefined,
      undefined,
      CUSTOM_SLABS,
    );
    expect(breakdown.pickupCash.commission).toBe(8_000);
  });
});

describe('sumOnlinePaymentsCollectedFromBreakdown', () => {
  it('sums pickup online and delivery online item nets, including card and loyalty', () => {
    const createdAt = new Date('2026-08-23T00:00:00.000Z');
    const breakdown = accumulateSettlementBreakdown(
      [
        {
          subtotal: 1400,
          discount: 0,
          loyaltyDiscount: 0,
          total: 1400,
          orderMode: 'TAKEAWAY',
          paymentMethod: 'CASH_AT_COUNTER',
          createdAt,
        },
        {
          subtotal: 300,
          discount: 0,
          loyaltyDiscount: 0,
          total: 300,
          orderMode: 'TAKEAWAY',
          paymentMethod: 'PAYHERE',
          createdAt,
        },
      ],
      0,
    );
    expect(sumOnlinePaymentsCollectedFromBreakdown(breakdown)).toBe(300);
    expect(sumBreakdownOrderCount(breakdown)).toBe(2);
  });
});

describe('orderCommissionChannel', () => {
  it('classifies pickup cash', () => {
    expect(orderCommissionChannel('TAKEAWAY', 'CASH_AT_COUNTER')).toBe('pickupCash');
  });
});
