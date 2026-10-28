import type { OrderStatus, Prisma, RefundSubmittedBy } from '@prisma/client';
import type { CancelRefundTier } from './orderCancel';
import { computeSalesTotal } from './orderCancel';
import { computeRefundAmountFromPercentage } from './refundPaymentStructure';
import { getRefundPercentageForStatus } from './orderStatusRefundConfig';

type CancelledOrderForRefund = {
  id: string;
  userId: string | null;
  guestName: string | null;
  subtotal: number;
  discount: number;
  loyaltyDiscount: number;
  deliveryFee: number;
  convenientFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  user?: { name: string | null } | null;
};

export function mapAdminCancelReasonToRefundReason(
  cancelReason?: string | null,
): { cancellationReason: string; customReasonText?: string | null } {
  switch (cancelReason) {
    case 'OUT_OF_STOCK':
      return { cancellationReason: 'OTHER', customReasonText: 'Item out of stock / unavailable' };
    case 'PAYMENT_OR_SYSTEM_ISSUE':
      return { cancellationReason: 'PAYMENT_ISSUES' };
    case 'CUSTOMER_REQUEST':
    default:
      return { cancellationReason: 'CHANGED_MIND' };
  }
}

async function buildRefundAmounts(params: {
  submittedBy: RefundSubmittedBy;
  cancelledWithinWindow: boolean;
  refundTier: CancelRefundTier;
  salesTotal: number;
  deliveryFee: number;
  convenienceFee: number;
  orderTotal: number;
  orderStatusAtCancel: OrderStatus;
}): Promise<{
  refundPercentage: number | null;
  refundAmount: number | null;
  penaltyAmount: number | null;
  configuredStatusRefundPercentage: number | null;
}> {
  if (params.submittedBy === 'BRANCH_ADMIN') {
    return {
      refundPercentage: 100,
      refundAmount: params.orderTotal,
      penaltyAmount: params.deliveryFee + params.convenienceFee,
      configuredStatusRefundPercentage: 100,
    };
  }

  if (params.refundTier === 'full' || params.cancelledWithinWindow) {
    return {
      refundPercentage: 100,
      refundAmount: params.orderTotal,
      penaltyAmount: null,
      configuredStatusRefundPercentage: 100,
    };
  }

  const configuredStatusRefundPercentage = await getRefundPercentageForStatus(params.orderStatusAtCancel);
  const refundAmount = computeRefundAmountFromPercentage(
    params.salesTotal,
    configuredStatusRefundPercentage,
  );

  return {
    refundPercentage: configuredStatusRefundPercentage,
    refundAmount,
    penaltyAmount: null,
    configuredStatusRefundPercentage,
  };
}

export async function createRefundForCancelledOrder(
  tx: Prisma.TransactionClient,
  params: {
    order: CancelledOrderForRefund;
    submittedBy: RefundSubmittedBy;
    cancellationReason: string;
    customReasonText?: string | null;
    refundTier: CancelRefundTier;
    cancelledWithinWindow: boolean;
    orderStatusAtCancel: OrderStatus;
  },
) {
  const salesTotal = computeSalesTotal(params.order);
  const {
    refundPercentage,
    refundAmount,
    penaltyAmount,
    configuredStatusRefundPercentage,
  } = await buildRefundAmounts({
    submittedBy: params.submittedBy,
    cancelledWithinWindow: params.cancelledWithinWindow,
    refundTier: params.refundTier,
    salesTotal,
    deliveryFee: params.order.deliveryFee,
    convenienceFee: params.order.convenientFee,
    orderTotal: params.order.total,
    orderStatusAtCancel: params.orderStatusAtCancel,
  });

  return tx.refund.create({
    data: {
      orderId: params.order.id,
      customerId: params.order.userId,
      customerName: params.order.guestName || params.order.user?.name || 'Guest',
      submittedBy: params.submittedBy,
      cancellationReason: params.cancellationReason,
      customReasonText: params.customReasonText ?? null,
      cancelledWithinWindow: params.cancelledWithinWindow,
      cancelledAtStatus: params.orderStatusAtCancel,
      configuredStatusRefundPercentage,
      salesTotal,
      deliveryFee: params.order.deliveryFee,
      convenienceFee: params.order.convenientFee,
      orderTotal: params.order.total,
      refundPercentage,
      refundAmount,
      penaltyAmount,
      status: 'RECEIVED',
    },
  });
}

export function isOnlinePaidOrder(paymentMethod: string, paymentStatus: string): boolean {
  const isOnline = paymentMethod === 'PAYHERE' || paymentMethod === 'CARD';
  return isOnline && paymentStatus === 'PAID';
}
