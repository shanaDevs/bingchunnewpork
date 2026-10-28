import { describe, expect, it } from 'vitest';
import {
  buildRefundPaymentStructure,
  buildRejectedRefundPaymentStructure,
  computeRefundAmountFromPercentage,
  GATEWAY_PENALTY_LKR,
  getTotalReturningAmount,
  isFullRefundScenario,
} from '../../src/lib/refundPaymentStructure';

describe('isFullRefundScenario', () => {
  it('returns true for branch admin cancel', () => {
    expect(
      isFullRefundScenario({
        submittedBy: 'BRANCH_ADMIN',
        cancelledWithinWindow: false,
        refundPercentage: null,
      }),
    ).toBe(true);
  });

  it('returns true when cancelled within window', () => {
    expect(
      isFullRefundScenario({
        submittedBy: 'CUSTOMER',
        cancelledWithinWindow: true,
        refundPercentage: null,
      }),
    ).toBe(true);
  });

  it('returns false for partial customer cancel after window even at 100%', () => {
    expect(
      isFullRefundScenario({
        submittedBy: 'CUSTOMER',
        cancelledWithinWindow: false,
        refundPercentage: 100,
      }),
    ).toBe(false);
  });
});

describe('computeRefundAmountFromPercentage', () => {
  it('rounds sales total percentage', () => {
    expect(computeRefundAmountFromPercentage(4400, 20)).toBe(880);
    expect(computeRefundAmountFromPercentage(1001, 33)).toBe(330);
  });
});

describe('buildRefundPaymentStructure', () => {
  const base = {
    salesTotal: 4400,
    deliveryFee: 150,
    convenienceFee: 330,
    orderTotal: 4880,
    paymentMethod: 'PAYHERE',
    orderMode: 'DELIVERY',
  };

  it('cashier cancel: full sales and fees return, flat gateway penalty stored', () => {
    const result = buildRefundPaymentStructure({
      ...base,
      submittedBy: 'BRANCH_ADMIN',
      cancelledWithinWindow: false,
      refundPercentage: 100,
    });

    expect(result).toEqual({
      returningSubtotal: 4400,
      notReturningSubtotal: 0,
      returningDeliveryFee: 150,
      returningConvenienceFee: 330,
      nonRefundableDeliveryFee: 0,
      nonRefundableConvenienceFee: 0,
      additionalGatewayFee: GATEWAY_PENALTY_LKR,
    });
    expect(getTotalReturningAmount(result)).toBe(5030);
  });

  it('cashier cancel: flat gateway penalty regardless of payment method', () => {
    const result = buildRefundPaymentStructure({
      ...base,
      submittedBy: 'BRANCH_ADMIN',
      cancelledWithinWindow: false,
      refundPercentage: 100,
      paymentMethod: 'CASH',
    });

    expect(result.additionalGatewayFee).toBe(GATEWAY_PENALTY_LKR);
    expect(result.returningDeliveryFee).toBe(150);
  });

  it('customer cancel within window: full sales and fees return, no gateway penalty', () => {
    const result = buildRefundPaymentStructure({
      ...base,
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: true,
      refundPercentage: 100,
    });

    expect(result).toEqual({
      returningSubtotal: 4400,
      notReturningSubtotal: 0,
      returningDeliveryFee: 150,
      returningConvenienceFee: 330,
      nonRefundableDeliveryFee: 0,
      nonRefundableConvenienceFee: 0,
      additionalGatewayFee: 0,
    });
    expect(getTotalReturningAmount(result)).toBe(4880);
  });

  it('customer partial cancel at 100% sales: fees non-refundable, not in total', () => {
    const result = buildRefundPaymentStructure({
      ...base,
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: false,
      refundPercentage: 100,
    });

    expect(result).toEqual({
      returningSubtotal: 4400,
      notReturningSubtotal: 0,
      returningDeliveryFee: 0,
      returningConvenienceFee: 0,
      nonRefundableDeliveryFee: 150,
      nonRefundableConvenienceFee: 330,
      additionalGatewayFee: 0,
    });
    expect(getTotalReturningAmount(result)).toBe(4400);
  });

  it('customer partial cancel: percentage of sales, fees retained, no returning fees', () => {
    const result = buildRefundPaymentStructure({
      ...base,
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: false,
      refundPercentage: 20,
    });

    expect(result).toEqual({
      returningSubtotal: 880,
      notReturningSubtotal: 3520,
      returningDeliveryFee: 0,
      returningConvenienceFee: 0,
      nonRefundableDeliveryFee: 150,
      nonRefundableConvenienceFee: 330,
      additionalGatewayFee: 0,
    });
  });
});

describe('buildRejectedRefundPaymentStructure', () => {
  it('retains the full after-discount sales total and applicable fees', () => {
    expect(
      buildRejectedRefundPaymentStructure({
        salesTotal: 4400,
        deliveryFee: 150,
        convenienceFee: 330,
      }),
    ).toEqual({
      returningSubtotal: 0,
      notReturningSubtotal: 4400,
      returningDeliveryFee: 0,
      returningConvenienceFee: 0,
      nonRefundableDeliveryFee: 150,
      nonRefundableConvenienceFee: 330,
      additionalGatewayFee: 0,
    });
  });

  it('stores 0 delivery for takeaway and 0 convenience when none applies', () => {
    expect(
      buildRejectedRefundPaymentStructure({
        salesTotal: 2200,
        deliveryFee: 0,
        convenienceFee: 0,
      }),
    ).toEqual({
      returningSubtotal: 0,
      notReturningSubtotal: 2200,
      returningDeliveryFee: 0,
      returningConvenienceFee: 0,
      nonRefundableDeliveryFee: 0,
      nonRefundableConvenienceFee: 0,
      additionalGatewayFee: 0,
    });
  });
});
