import type { RefundSubmittedBy } from '@prisma/client';

export const GATEWAY_PENALTY_LKR = 150;

export function isBranchInitiatedRefund(refund: {
  submittedBy: RefundSubmittedBy | string;
  order?: { cancelledBy?: string | null } | null;
}): boolean {
  if (refund.submittedBy === 'BRANCH_ADMIN') return true;
  const cancelledBy = refund.order?.cancelledBy?.trim();
  return !!cancelledBy && cancelledBy.toLowerCase() !== 'customer';
}

/** LKR penalty for branch/cashier-initiated cancellations (uses stored value or default). */
export function resolveBranchCancellationGatewayFeeLkr(refund: {
  submittedBy: RefundSubmittedBy | string;
  additionalGatewayFee?: number | null;
  order?: { cancelledBy?: string | null } | null;
}): number {
  if (!isBranchInitiatedRefund(refund)) return 0;
  if (refund.additionalGatewayFee != null && refund.additionalGatewayFee > 0) {
    return refund.additionalGatewayFee;
  }
  return GATEWAY_PENALTY_LKR;
}

export type RefundPaymentStructure = {
  returningSubtotal: number;
  notReturningSubtotal: number;
  returningDeliveryFee: number;
  returningConvenienceFee: number;
  nonRefundableDeliveryFee: number;
  nonRefundableConvenienceFee: number;
  additionalGatewayFee: number;
};

export function computeRefundAmountFromPercentage(
  salesTotal: number,
  refundPercentage: number,
): number {
  return Math.round((salesTotal * refundPercentage) / 100);
}

export function isFullRefundScenario(params: {
  submittedBy: RefundSubmittedBy | string;
  cancelledWithinWindow: boolean;
  refundPercentage?: number | null;
}): boolean {
  return (
    params.submittedBy === 'BRANCH_ADMIN'
    || params.cancelledWithinWindow
  );
}

function computeAdditionalGatewayFee(params: {
  submittedBy: RefundSubmittedBy | string;
}): number {
  if (params.submittedBy !== 'BRANCH_ADMIN') return 0;
  return GATEWAY_PENALTY_LKR;
}

export function getTotalReturningAmount(structure: RefundPaymentStructure): number {
  return (
    structure.returningSubtotal
    + structure.returningDeliveryFee
    + structure.returningConvenienceFee
    + structure.additionalGatewayFee
  );
}

export function buildRefundPaymentStructure(params: {
  submittedBy: RefundSubmittedBy | string;
  cancelledWithinWindow: boolean;
  refundPercentage: number;
  salesTotal: number;
  deliveryFee: number;
  convenienceFee: number;
  orderTotal: number;
  paymentMethod: string;
  orderMode: string;
}): RefundPaymentStructure {
  const fullRefund = isFullRefundScenario({
    submittedBy: params.submittedBy,
    cancelledWithinWindow: params.cancelledWithinWindow,
    refundPercentage: params.refundPercentage,
  });

  const additionalGatewayFee = computeAdditionalGatewayFee(params);

  if (fullRefund) {
    return {
      returningSubtotal: params.salesTotal,
      notReturningSubtotal: 0,
      returningDeliveryFee: params.deliveryFee,
      returningConvenienceFee: params.convenienceFee,
      nonRefundableDeliveryFee: 0,
      nonRefundableConvenienceFee: 0,
      additionalGatewayFee,
    };
  }

  const returningSubtotal = computeRefundAmountFromPercentage(
    params.salesTotal,
    params.refundPercentage,
  );

  return {
    returningSubtotal,
    notReturningSubtotal: params.salesTotal - returningSubtotal,
    returningDeliveryFee: 0,
    returningConvenienceFee: 0,
    nonRefundableDeliveryFee: params.deliveryFee,
    nonRefundableConvenienceFee: params.convenienceFee,
    additionalGatewayFee: 0,
  };
}

/** On reject the customer receives nothing — full after-discount/points sales total is retained. */
export function buildRejectedRefundPaymentStructure(params: {
  salesTotal: number;
  deliveryFee: number;
  convenienceFee: number;
}): RefundPaymentStructure {
  return {
    returningSubtotal: 0,
    notReturningSubtotal: Math.max(0, params.salesTotal),
    returningDeliveryFee: 0,
    returningConvenienceFee: 0,
    nonRefundableDeliveryFee: Math.max(0, params.deliveryFee),
    nonRefundableConvenienceFee: Math.max(0, params.convenienceFee),
    additionalGatewayFee: 0,
  };
}
