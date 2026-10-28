import type { RefundStatus, RefundSubmittedBy } from '@prisma/client';
import { buildRefundPaymentStructure } from './refundPaymentStructure';

export type LateCancelRefundForFee = {
  status: RefundStatus | string;
  submittedBy: RefundSubmittedBy | string;
  cancelledWithinWindow: boolean;
  nonRefundableDeliveryFee: number | null;
  deliveryFee: number;
  convenienceFee: number;
  salesTotal: number;
  orderTotal: number;
  refundPercentage: number | null;
  order: {
    paymentMethod: string;
    orderMode: string;
  };
};

/** Card-captured delivery fees that should take the payment-gateway cut. */
export function isGatewayChargedDeliveryMethod(method: string | null | undefined): boolean {
  return method === 'CARD' || method === 'PAYHERE';
}

function roundMoneyLkr(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeDeliveryWalletNet(params: {
  grossDeliveryFee: number;
  /** CARD/PAYHERE share of gross. Defaults to full gross (all card). */
  cardGrossDeliveryFee?: number;
  platformFeeRate: number;
  gatewayFeeRate: number;
}): {
  platformFee: number;
  afterPlatformFee: number;
  gatewayFee: number;
  netForDelivery: number;
} {
  const gross = Math.max(0, params.grossDeliveryFee);
  const cardGross = Math.max(0, Math.min(gross, params.cardGrossDeliveryFee ?? gross));
  const platformFee = roundMoneyLkr(gross * params.platformFeeRate);
  const afterPlatformFee = roundMoneyLkr(Math.max(0, gross - platformFee));
  const cardAfterPlatform = gross > 0 ? afterPlatformFee * (cardGross / gross) : 0;
  const gatewayFee = roundMoneyLkr(cardAfterPlatform * params.gatewayFeeRate);
  const netForDelivery = roundMoneyLkr(Math.max(0, afterPlatformFee - gatewayFee));
  return { platformFee, afterPlatformFee, gatewayFee, netForDelivery };
}

/** Unrefundable delivery fee for a processed (COMPLETE / REJECTED) customer late-cancel refund. */
export function resolveLateCancelDeliveryFee(refund: LateCancelRefundForFee): number {
  if (refund.submittedBy !== 'CUSTOMER' || refund.cancelledWithinWindow) return 0;
  if (refund.status !== 'COMPLETE' && refund.status !== 'REJECTED') return 0;

  if (refund.nonRefundableDeliveryFee != null) {
    return Math.max(0, refund.nonRefundableDeliveryFee);
  }

  const structure = buildRefundPaymentStructure({
    submittedBy: refund.submittedBy,
    cancelledWithinWindow: refund.cancelledWithinWindow,
    refundPercentage: refund.refundPercentage ?? 0,
    salesTotal: refund.salesTotal,
    deliveryFee: refund.deliveryFee,
    convenienceFee: refund.convenienceFee,
    orderTotal: refund.orderTotal,
    paymentMethod: refund.order.paymentMethod,
    orderMode: refund.order.orderMode,
  });
  return Math.max(0, structure.nonRefundableDeliveryFee);
}
