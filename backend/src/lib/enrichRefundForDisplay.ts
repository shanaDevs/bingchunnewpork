import type { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { computeSalesTotal } from './orderCancel';
import {
  computeRefundAmountFromPercentage,
  isFullRefundScenario,
} from './refundPaymentStructure';
import { getOrderStatusAtCancellation } from './orderStatusAtCancel';
import { getRefundPercentageForStatus } from './orderStatusRefundConfig';

type StatusEvent = { status: string; createdAt: Date | string };

export type RefundForEnrichment = {
  id?: string;
  status?: string;
  submittedBy: string;
  cancelledWithinWindow: boolean;
  refundPercentage: number | null;
  refundAmount: number | null;
  salesTotal: number;
  cancelledAtStatus?: OrderStatus | string | null;
  configuredStatusRefundPercentage?: number | null;
  order?: {
    subtotal?: number;
    discount?: number;
    loyaltyDiscount?: number;
    statusEvents?: StatusEvent[] | null;
  } | null;
};

export type EnrichRefundOptions = {
  persistIfReceived?: boolean;
  percentageMap?: { get(status: string): number | undefined };
};

function isFrozenRefundStatus(status?: string): boolean {
  return status === 'COMPLETE' || status === 'REJECTED';
}

async function resolveLivePercentageForStatus(
  orderStatus: string,
  percentageMap?: { get(status: string): number | undefined },
): Promise<number> {
  const fromMap = percentageMap?.get(orderStatus);
  if (fromMap != null) return fromMap;
  return getRefundPercentageForStatus(orderStatus);
}

export function resolveEffectiveSalesTotal(
  refund: Pick<RefundForEnrichment, 'salesTotal' | 'order'>,
): number {
  if (refund.salesTotal > 0) return refund.salesTotal;

  const order = refund.order;
  if (order?.subtotal == null) return refund.salesTotal;

  return computeSalesTotal({
    subtotal: order.subtotal,
    discount: order.discount ?? 0,
    loyaltyDiscount: order.loyaltyDiscount ?? 0,
  });
}

export async function resolvePartialRefundValues(existing: {
  refundPercentage: number | null;
  refundAmount: number | null;
  salesTotal: number;
  cancelledAtStatus: string | null;
  configuredStatusRefundPercentage: number | null;
  order: {
    subtotal?: number;
    discount?: number;
    loyaltyDiscount?: number;
    statusEvents?: StatusEvent[] | null;
  };
}): Promise<{ refundPercentage: number; refundAmount: number; salesTotal: number }> {
  const salesTotal = resolveEffectiveSalesTotal(existing);

  const cancelledAtStatus = existing.cancelledAtStatus
    ?? getOrderStatusAtCancellation({ statusEvents: existing.order.statusEvents });

  if (!cancelledAtStatus) {
    throw new Error('Refund percentage has not been set for this partial refund');
  }

  const refundPercentage = await getRefundPercentageForStatus(cancelledAtStatus);

  return {
    refundPercentage,
    refundAmount: computeRefundAmountFromPercentage(salesTotal, refundPercentage),
    salesTotal,
  };
}

export async function enrichRefundForDisplay<T extends RefundForEnrichment>(
  refund: T,
  options?: EnrichRefundOptions,
): Promise<T> {
  if (isFullRefundScenario(refund)) {
    return refund;
  }

  if (isFrozenRefundStatus(refund.status)) {
    return refund;
  }

  const salesTotal = resolveEffectiveSalesTotal(refund);
  const statusEvents = refund.order?.statusEvents ?? [];
  const cancelledAtStatus = (refund.cancelledAtStatus
    ?? getOrderStatusAtCancellation({ statusEvents })) as OrderStatus | null;

  if (!cancelledAtStatus) {
    return salesTotal !== refund.salesTotal
      ? { ...refund, salesTotal }
      : refund;
  }

  const refundPercentage = await resolveLivePercentageForStatus(
    cancelledAtStatus,
    options?.percentageMap,
  );
  const refundAmount = computeRefundAmountFromPercentage(salesTotal, refundPercentage);

  const enriched = {
    ...refund,
    salesTotal,
    cancelledAtStatus: refund.cancelledAtStatus ?? cancelledAtStatus,
    configuredStatusRefundPercentage: refundPercentage,
    refundPercentage,
    refundAmount,
  } as T;

  if (
    options?.persistIfReceived
    && refund.status === 'RECEIVED'
    && refund.id
    && (refund.refundPercentage == null || refund.refundAmount == null)
  ) {
    const data: Prisma.RefundUpdateInput = {
      salesTotal,
      cancelledAtStatus,
      configuredStatusRefundPercentage: refundPercentage,
      refundPercentage,
      refundAmount,
    };

    await prisma.refund.update({
      where: { id: refund.id },
      data,
    });
  }

  return enriched;
}
