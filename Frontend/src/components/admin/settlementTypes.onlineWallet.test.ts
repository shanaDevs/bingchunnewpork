import { describe, expect, it } from 'vitest';
import {
  resolveFirstPayoutBranchWalletNetLkr,
  resolveFirstPayoutGatewayBaseLkr,
  resolveFirstPayoutOnlineSubtotalComponents,
  sumOnlineRevenueSubtotals,
  sumOnlineSubtotalBeforeDiscount,
  type SettlementBreakdown,
  type WithdrawalBreakdown,
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
    expect(resolveFirstPayoutOnlineSubtotalComponents(breakdown).totalLkr).toBe(9790);
  });
});

describe('Payout 1 gateway base', () => {
  it('uses pickup + delivery online revenue after discounts', () => {
    const channelBreakdown = {
      pickupOnline: { revenueSubtotal: 19199, subtotalBeforeDiscount: 21490 },
      deliveryOnline: { revenueSubtotal: 0, subtotalBeforeDiscount: 0 },
    } as SettlementBreakdown;
    const breakdown = {
      cycleStage: 'FIRST',
      gatewayRatePct: 1.9,
      gatewayFee: 36478,
      netAmount: 1883422,
      channelBreakdown,
    } as WithdrawalBreakdown;

    expect(resolveFirstPayoutGatewayBaseLkr(breakdown)).toBe(19199);
    expect(resolveFirstPayoutBranchWalletNetLkr(breakdown)).toBe(18834.22);
  });
});
