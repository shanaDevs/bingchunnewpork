import { describe, expect, it } from 'vitest';
import {
  resolveFirstPayoutOnlineSubtotalComponents,
  sumOnlineRevenueSubtotals,
  sumOnlineSubtotalBeforeDiscount,
  type SettlementBreakdown,
} from '@/components/admin/settlementTypes';

describe('sumOnlineRevenueSubtotals', () => {
  it('sums pickup and delivery online net revenue subtotals', () => {
    const breakdown = {
      pickupOnline: { revenueSubtotal: 1000, subtotalBeforeDiscount: 1200 },
      deliveryOnline: { revenueSubtotal: 8790, subtotalBeforeDiscount: 9000 },
    } as SettlementBreakdown;

    expect(sumOnlineRevenueSubtotals(breakdown)).toBe(1000 + 8790);
  });
});

describe('sumOnlineSubtotalBeforeDiscount', () => {
  it('sums pickup and delivery online subtotal before discounts', () => {
    const breakdown = {
      pickupOnline: { revenueSubtotal: 1000, subtotalBeforeDiscount: 1200 },
      deliveryOnline: { revenueSubtotal: 8790, subtotalBeforeDiscount: 9000 },
    } as SettlementBreakdown;

    expect(sumOnlineSubtotalBeforeDiscount(breakdown)).toBe(1200 + 9000);
    expect(resolveFirstPayoutOnlineSubtotalComponents(breakdown).totalLkr).toBe(10200);
  });
});
