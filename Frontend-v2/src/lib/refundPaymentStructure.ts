export const GATEWAY_PENALTY_LKR = 150;

export type RefundPaymentStructure = {
  returningSubtotal: number;
  notReturningSubtotal: number;
  returningDeliveryFee: number;
  returningConvenienceFee: number;
  nonRefundableDeliveryFee: number;
  nonRefundableConvenienceFee: number;
  additionalGatewayFee: number;
};

function computeAdditionalGatewayFee(params: {
  submittedBy?: 'CUSTOMER' | 'BRANCH_ADMIN';
}): number {
  if (params.submittedBy !== 'BRANCH_ADMIN') return 0;
  return GATEWAY_PENALTY_LKR;
}

export function isFullRefundScenario(refund: {
  submittedBy?: 'CUSTOMER' | 'BRANCH_ADMIN';
  cancelledWithinWindow: boolean;
  refundPercentage?: number | null;
}): boolean {
  return (
    refund.submittedBy === 'BRANCH_ADMIN'
    || refund.cancelledWithinWindow
  );
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
  submittedBy?: 'CUSTOMER' | 'BRANCH_ADMIN';
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

  const returningSubtotal = Math.round((params.salesTotal * params.refundPercentage) / 100);

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

export type RefundRecipientTotals = {
  customerReceive: number;
  branchReceive: number;
  deliveryReceive: number;
  platformReceive: number;
};

export function computeRefundRecipientTotals(refund: {
  status: string;
  refundAmount?: number | null;
  notReturningSubtotal?: number | null;
  nonRefundableDeliveryFee?: number | null;
  nonRefundableConvenienceFee?: number | null;
}): RefundRecipientTotals {
  if (refund.status === 'REJECTED') {
    return {
      customerReceive: 0,
      branchReceive: refund.notReturningSubtotal ?? 0,
      deliveryReceive: refund.nonRefundableDeliveryFee ?? 0,
      platformReceive: refund.nonRefundableConvenienceFee ?? 0,
    };
  }

  if (refund.status !== 'COMPLETE') {
    return {
      customerReceive: 0,
      branchReceive: 0,
      deliveryReceive: 0,
      platformReceive: 0,
    };
  }

  return {
    customerReceive: refund.refundAmount ?? 0,
    branchReceive: refund.notReturningSubtotal ?? 0,
    deliveryReceive: refund.nonRefundableDeliveryFee ?? 0,
    platformReceive: refund.nonRefundableConvenienceFee ?? 0,
  };
}

export function getStoredOrPreviewPaymentStructure(
  refund: {
    submittedBy?: 'CUSTOMER' | 'BRANCH_ADMIN';
    cancelledWithinWindow: boolean;
    salesTotal: number;
    deliveryFee: number;
    convenienceFee: number;
    orderTotal: number;
    refundPercentage?: number | null;
    returningSubtotal?: number | null;
    notReturningSubtotal?: number | null;
    returningDeliveryFee?: number | null;
    returningConvenienceFee?: number | null;
    nonRefundableDeliveryFee?: number | null;
    nonRefundableConvenienceFee?: number | null;
    additionalGatewayFee?: number | null;
    status: string;
  },
  order: {
    paymentMethod: string;
    orderMode: string;
  },
  previewRefundPercentage: number,
): RefundPaymentStructure {
  if (refund.status === 'REJECTED') {
    if (
      refund.returningSubtotal != null
      && refund.notReturningSubtotal != null
      && refund.nonRefundableDeliveryFee != null
      && refund.nonRefundableConvenienceFee != null
      && refund.additionalGatewayFee != null
    ) {
      return {
        returningSubtotal: refund.returningSubtotal,
        notReturningSubtotal: refund.notReturningSubtotal,
        returningDeliveryFee: refund.returningDeliveryFee ?? 0,
        returningConvenienceFee: refund.returningConvenienceFee ?? 0,
        nonRefundableDeliveryFee: refund.nonRefundableDeliveryFee,
        nonRefundableConvenienceFee: refund.nonRefundableConvenienceFee,
        additionalGatewayFee: refund.additionalGatewayFee,
      };
    }

    return buildRejectedRefundPaymentStructure({
      salesTotal: refund.salesTotal,
      deliveryFee: refund.deliveryFee,
      convenienceFee: refund.convenienceFee,
    });
  }

  const isStored = refund.status === 'COMPLETE';

  if (
    isStored
    && refund.returningSubtotal != null
    && refund.notReturningSubtotal != null
    && refund.nonRefundableDeliveryFee != null
    && refund.nonRefundableConvenienceFee != null
    && refund.additionalGatewayFee != null
  ) {
    const preview = buildRefundPaymentStructure({
      submittedBy: refund.submittedBy,
      cancelledWithinWindow: refund.cancelledWithinWindow,
      refundPercentage: previewRefundPercentage,
      salesTotal: refund.salesTotal,
      deliveryFee: refund.deliveryFee,
      convenienceFee: refund.convenienceFee,
      orderTotal: refund.orderTotal,
      paymentMethod: order.paymentMethod,
      orderMode: order.orderMode,
    });

    const isCustomerPartial =
      refund.submittedBy !== 'BRANCH_ADMIN' && !refund.cancelledWithinWindow;

    if (isCustomerPartial) {
      return preview;
    }

    return {
      returningSubtotal: refund.returningSubtotal,
      notReturningSubtotal: refund.notReturningSubtotal,
      returningDeliveryFee: refund.returningDeliveryFee ?? preview.returningDeliveryFee,
      returningConvenienceFee: refund.returningConvenienceFee ?? preview.returningConvenienceFee,
      nonRefundableDeliveryFee: refund.nonRefundableDeliveryFee,
      nonRefundableConvenienceFee: refund.nonRefundableConvenienceFee,
      additionalGatewayFee: refund.additionalGatewayFee,
    };
  }

  return buildRefundPaymentStructure({
    submittedBy: refund.submittedBy,
    cancelledWithinWindow: refund.cancelledWithinWindow,
    refundPercentage: previewRefundPercentage,
    salesTotal: refund.salesTotal,
    deliveryFee: refund.deliveryFee,
    convenienceFee: refund.convenienceFee,
    orderTotal: refund.orderTotal,
    paymentMethod: order.paymentMethod,
    orderMode: order.orderMode,
  });
}
