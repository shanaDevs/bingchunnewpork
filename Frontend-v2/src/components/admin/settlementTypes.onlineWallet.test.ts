import { describe, expect, it } from 'vitest';
import {
  emptySettlementBreakdown,
  sumChannelRevenueSubtotals,
  sumOnlineRevenueSubtotals,
} from '@/components/admin/settlementTypes';

describe('sumOnlineRevenueSubtotals', () => {
  it('equals pickup online plus delivery online item nets', () => {
    const breakdown = emptySettlementBreakdown();
    breakdown.pickupCash.revenueSubtotal = 1400;
    breakdown.pickupCard.revenueSubtotal = 300;
    breakdown.pickupOnline.revenueSubtotal = 1000;
    breakdown.pickupOnline.convenientFeeTotal = 50;
    breakdown.pickupOnline.payhereRevenueSubtotal = 1000;
    breakdown.deliveryOnline.revenueSubtotal = 8790;
    breakdown.deliveryOnline.payhereRevenueSubtotal = 6590;
    breakdown.deliveryOnline.deliveryFeeTotal = 2800;
    breakdown.deliveryOnline.convenientFeeTotal = 572;

    expect(sumOnlineRevenueSubtotals(breakdown)).toBe(1000 + 8790);
    expect(sumChannelRevenueSubtotals(breakdown)).toBe(1400 + 300 + 1000 + 8790);
  });
});
