import { describe, expect, it } from 'vitest';
import {
  accumulateSettlementBreakdown,
  COMMISSION_SLABS,
  computePlatformCommission,
  getEffectiveRate,
  getSlabIndex,
  orderCommissionChannel,
  sumBreakdownOrderCount,
  sumOnlinePaymentsCollectedFromBreakdown,
} from '../../src/lib/commission';

describe('commission tier boundaries', () => {
  it('uses 6.5% up to 1M', () => {
    expect(getSlabIndex(1_000_000)).toBe(0);
    expect(getEffectiveRate(1_000_000)).toBe(0.065);
    expect(computePlatformCommission(100_000, 1_000_000)).toBe(6_500);
  });

  it('uses 5.5% above 1M through 2M', () => {
    expect(getSlabIndex(1_000_001)).toBe(1);
    expect(getEffectiveRate(2_000_000)).toBe(0.055);
    expect(computePlatformCommission(100_000, 2_000_000)).toBe(5_500);
  });

  it('uses 5.0% above 2M through 3M', () => {
    expect(getSlabIndex(2_000_001)).toBe(2);
    expect(getEffectiveRate(3_000_000)).toBe(0.05);
    expect(computePlatformCommission(100_000, 3_000_000)).toBe(5_000);
  });

  it('uses 4.5% above 3M', () => {
    expect(getSlabIndex(3_000_001)).toBe(3);
    expect(getEffectiveRate(4_000_000)).toBe(0.045);
    expect(computePlatformCommission(100_000, 4_000_000)).toBe(4_500);
  });

  it('exposes updated slab labels', () => {
    expect(COMMISSION_SLABS[0].label).toContain('1,000,000');
    expect(COMMISSION_SLABS[3].label).toContain('Above');
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
          paymentMethod: 'CARD',
          createdAt,
        },
        {
          subtotal: 1000,
          discount: 0,
          loyaltyDiscount: 0,
          total: 1050,
          convenientFee: 50,
          orderMode: 'TAKEAWAY',
          paymentMethod: 'PAYHERE',
          createdAt,
        },
        {
          subtotal: 2200,
          discount: 0,
          loyaltyDiscount: 0,
          total: 2680,
          deliveryFee: 400,
          convenientFee: 80,
          orderMode: 'DELIVERY',
          paymentMethod: 'CARD',
          createdAt,
        },
        {
          subtotal: 500,
          discount: 0,
          loyaltyDiscount: 0,
          total: 500,
          deliveryFee: 0,
          convenientFee: 0,
          orderMode: 'DELIVERY',
          paymentMethod: 'LOYALTY_POINTS',
          createdAt,
        },
      ],
      5400,
    );

    expect(breakdown.deliveryOnline.revenueSubtotal).toBe(2700);
    expect(breakdown.deliveryOnline.deliveryFeeTotal).toBe(400);
    expect(breakdown.deliveryOnline.convenientFeeTotal).toBe(80);
    expect(breakdown.pickupOnline.revenueSubtotal).toBe(1000);
    expect(breakdown.pickupCash.revenueSubtotal).toBe(1400);
    expect(breakdown.pickupCard.revenueSubtotal).toBe(300);
    expect(sumOnlinePaymentsCollectedFromBreakdown(breakdown)).toBe(3700);
    expect(sumBreakdownOrderCount(breakdown)).toBe(5);
  });
});

describe('orderCommissionChannel pickup card vs pickup online', () => {
  it('keeps counter card pickup on pickup card', () => {
    expect(orderCommissionChannel('TAKEAWAY', 'CARD')).toBe('pickupCard');
    expect(orderCommissionChannel('TAKEAWAY', 'CARD', { paymentGateway: null, paymentRef: null })).toBe(
      'pickupCard',
    );
  });

  it('counts gateway card pickup as pickup online', () => {
    expect(orderCommissionChannel('TAKEAWAY', 'CARD', { paymentGateway: 'WEBXPAY' })).toBe('pickupOnline');
    expect(orderCommissionChannel('TAKEAWAY', 'CARD', { paymentRef: 'ph_123' })).toBe('pickupOnline');
    expect(orderCommissionChannel('TAKEAWAY', 'PAYHERE')).toBe('pickupOnline');
  });
});
