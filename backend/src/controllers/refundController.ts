import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { Prisma, RefundStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { paginated, success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { assertOrderStoreAccess, isBranchScopedRole, requireBranchStoreId } from '../middleware/auth';
import { assertValidRefundStatusTransition } from '../lib/refundStatus';
import {
  buildRefundPaymentStructure,
  buildRejectedRefundPaymentStructure,
  isFullRefundScenario,
} from '../lib/refundPaymentStructure';
import {
  enrichRefundForDisplay,
  resolveEffectiveSalesTotal,
  resolvePartialRefundValues,
} from '../lib/enrichRefundForDisplay';
import { getOrderStatusRefundPercentageMap } from '../lib/orderStatusRefundConfig';
import { getAllCancelReasons } from '../lib/cancelReasonConfig';

type RefundRequestType = 'within_window' | 'after_window' | 'cashier';

const ORDER_STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Order Received',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const REQUEST_TYPE_LABELS: Record<RefundRequestType, string> = {
  within_window: 'Within cancel window',
  after_window: 'After cancel window',
  cashier: 'Cashier cancel',
};

const DISTRIBUTION_CHART_COLORS = [
  '#6366f1',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
];

function percentOf(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function refundRequestTypeOf(refund: {
  submittedBy: string;
  cancelledWithinWindow: boolean;
}): RefundRequestType {
  if (refund.submittedBy === 'BRANCH_ADMIN') return 'cashier';
  if (refund.cancelledWithinWindow) return 'within_window';
  return 'after_window';
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const REFUND_STATUSES = new Set<RefundStatus>([
  'RECEIVED',
  'COMPLETE',
  'REJECTED',
]);

const refundDetailInclude = {
  order: {
    include: {
      items: {
        include: {
          toppings: true,
          product: { select: { imageUrl: true } },
        },
      },
      statusEvents: { orderBy: { createdAt: 'asc' as const } },
      store: { select: { id: true, name: true, city: true, addressLine: true } },
      user: { select: { id: true, name: true, phone: true, email: true } },
    },
  },
} as const;

const updateRefundStatusSchema = z.object({
  status: z.enum(['COMPLETE', 'REJECTED']),
  refundPercentage: z.number().min(0).max(100).optional(),
  refundAmount: z.number().int().min(0).optional(),
  adminNotes: z.string().max(2000).optional(),
});

function buildRefundWhere(req: Request, query: Record<string, string>): Prisma.RefundWhereInput {
  const { status, storeId, startDate, endDate, search } = query;
  const where: Prisma.RefundWhereInput = {};

  if (status && REFUND_STATUSES.has(status as RefundStatus)) {
    where.status = status as RefundStatus;
  }

  const orderWhere: Prisma.OrderWhereInput = {};

  if (!isBranchScopedRole(req.user?.role) && storeId) {
    orderWhere.storeId = storeId;
  }

  if (search?.trim()) {
    const term = search.trim();
    orderWhere.OR = [
      { orderNumber: { contains: term } },
      { id: term },
    ];
  }

  if (Object.keys(orderWhere).length > 0) {
    where.order = { is: orderWhere };
  }

  const createdAtFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) {
    const from = new Date(startDate);
    if (!Number.isNaN(from.getTime())) {
      from.setHours(0, 0, 0, 0);
      createdAtFilter.gte = from;
    }
  }
  if (endDate) {
    const to = new Date(endDate);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      createdAtFilter.lte = to;
    }
  }
  if (createdAtFilter.gte || createdAtFilter.lte) {
    where.createdAt = createdAtFilter;
  }

  return where;
}

async function applyBranchRefundScope(req: Request, where: Prisma.RefundWhereInput) {
  if (!isBranchScopedRole(req.user?.role)) return;
  const storeId = await requireBranchStoreId(req);
  const existingOrderWhere =
    where.order && typeof where.order === 'object' && 'is' in where.order && where.order.is
      ? (where.order.is as Prisma.OrderWhereInput)
      : typeof where.order === 'object' && where.order && !('is' in where.order) && !('isNot' in where.order)
        ? (where.order as Prisma.OrderWhereInput)
        : {};

  where.order = {
    is: {
      ...existingOrderWhere,
      storeId,
    },
  };
}

function isFullRefund(refund: {
  submittedBy: string;
  cancelledWithinWindow: boolean;
  refundPercentage: number | null;
}): boolean {
  return isFullRefundScenario(refund);
}

export async function getRefundsSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = req.query as Record<string, string>;
    const where = buildRefundWhere(req, filters);
    where.status = { in: ['COMPLETE', 'REJECTED'] };
    await applyBranchRefundScope(req, where);

    const refunds = await prisma.refund.findMany({
      where,
      take: 5000,
      select: {
        status: true,
        refundAmount: true,
        notReturningSubtotal: true,
        nonRefundableDeliveryFee: true,
        nonRefundableConvenienceFee: true,
        additionalGatewayFee: true,
      },
    });

    const totals = refunds.reduce(
      (acc, refund) => {
        if (refund.status === 'COMPLETE') {
          acc.customerReceiveTotalLkr += refund.refundAmount ?? 0;
        }
        acc.branchReceiveTotalLkr += refund.notReturningSubtotal ?? 0;
        acc.deliveryReceiveTotalLkr += refund.nonRefundableDeliveryFee ?? 0;
        acc.platformReceiveTotalLkr +=
          (refund.nonRefundableConvenienceFee ?? 0) + (refund.additionalGatewayFee ?? 0);
        return acc;
      },
      {
        count: refunds.length,
        customerReceiveTotalLkr: 0,
        branchReceiveTotalLkr: 0,
        deliveryReceiveTotalLkr: 0,
        platformReceiveTotalLkr: 0,
      },
    );

    return success(res, totals);
  } catch (err) {
    next(err);
  }
}

export async function getRefundAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = req.query as Record<string, string>;
    const where = buildRefundWhere(req, filters);
    await applyBranchRefundScope(req, where);

    const [refunds, cancelReasons] = await Promise.all([
      prisma.refund.findMany({
        where,
        select: {
          id: true,
          status: true,
          cancellationReason: true,
          cancelledAtStatus: true,
          submittedBy: true,
          cancelledWithinWindow: true,
          refundAmount: true,
          refundPercentage: true,
          createdAt: true,
          processedAt: true,
          order: {
            select: {
              orderMode: true,
              items: {
                select: {
                  productId: true,
                  productName: true,
                  product: { select: { name: true, imageUrl: true } },
                },
              },
            },
          },
        },
      }),
      getAllCancelReasons(),
    ]);

    const reasonLabelMap = new Map(cancelReasons.map((reason) => [reason.value, reason.label]));
    const totalCount = refunds.length;

    let totalRefundAmountLkr = 0;
    let refundPercentageSum = 0;
    let refundPercentageCount = 0;
    let completeCount = 0;
    let rejectedCount = 0;
    let pendingCount = 0;
    let processingHoursSum = 0;
    let processingHoursCount = 0;

    const cancelAtStatusCounts = new Map<string, number>();
    const reasonCounts = new Map<string, number>();
    const requestTypeCounts = new Map<RefundRequestType, number>();
    const orderModeCounts = new Map<string, number>();
    const dailyTrendMap = new Map<string, { count: number; amountLkr: number }>();
    const productMap = new Map<
      string,
      { productName: string; imageUrl: string | null; refundCount: number; refundAmountLkr: number }
    >();

    for (const refund of refunds) {
      const amount = refund.refundAmount ?? 0;
      totalRefundAmountLkr += amount;

      if (refund.refundPercentage != null) {
        refundPercentageSum += refund.refundPercentage;
        refundPercentageCount += 1;
      }

      if (refund.status === 'COMPLETE') completeCount += 1;
      else if (refund.status === 'REJECTED') rejectedCount += 1;
      else pendingCount += 1;

      if (
        (refund.status === 'COMPLETE' || refund.status === 'REJECTED') &&
        refund.processedAt
      ) {
        const hours =
          (refund.processedAt.getTime() - refund.createdAt.getTime()) / (1000 * 60 * 60);
        if (hours >= 0) {
          processingHoursSum += hours;
          processingHoursCount += 1;
        }
      }

      const cancelStatus = refund.cancelledAtStatus ?? 'UNKNOWN';
      cancelAtStatusCounts.set(cancelStatus, (cancelAtStatusCounts.get(cancelStatus) ?? 0) + 1);

      const reasonKey = refund.cancellationReason || 'UNKNOWN';
      reasonCounts.set(reasonKey, (reasonCounts.get(reasonKey) ?? 0) + 1);

      const requestType = refundRequestTypeOf(refund);
      requestTypeCounts.set(requestType, (requestTypeCounts.get(requestType) ?? 0) + 1);

      const orderMode = refund.order.orderMode || 'UNKNOWN';
      orderModeCounts.set(orderMode, (orderModeCounts.get(orderMode) ?? 0) + 1);

      const dateKey = formatDateKey(refund.createdAt);
      const dailyBucket = dailyTrendMap.get(dateKey) ?? { count: 0, amountLkr: 0 };
      dailyBucket.count += 1;
      dailyBucket.amountLkr += amount;
      dailyTrendMap.set(dateKey, dailyBucket);

      const distinctProducts = new Map<
        string,
        { productName: string; imageUrl: string | null }
      >();
      for (const item of refund.order.items) {
        if (!item.productId) continue;
        if (!distinctProducts.has(item.productId)) {
          distinctProducts.set(item.productId, {
            productName: item.product?.name ?? item.productName ?? 'Unknown product',
            imageUrl: item.product?.imageUrl ?? null,
          });
        }
      }

      const productCount = distinctProducts.size;
      const amountShare = productCount > 0 ? amount / productCount : 0;
      for (const [productId, productInfo] of distinctProducts) {
        const existing = productMap.get(productId) ?? {
          productName: productInfo.productName,
          imageUrl: productInfo.imageUrl,
          refundCount: 0,
          refundAmountLkr: 0,
        };
        existing.refundCount += 1;
        existing.refundAmountLkr += amountShare;
        productMap.set(productId, existing);
      }
    }

    const byCancelAtStatus = [...cancelAtStatusCounts.entries()]
      .map(([status, count], index) => ({
        status,
        label: ORDER_STATUS_LABELS[status] ?? status.replace(/_/g, ' '),
        count,
        percent: percentOf(count, totalCount),
        fill: DISTRIBUTION_CHART_COLORS[index % DISTRIBUTION_CHART_COLORS.length],
      }))
      .sort((a, b) => b.count - a.count);

    const byReason = [...reasonCounts.entries()]
      .map(([reason, count], index) => ({
        reason,
        label: reasonLabelMap.get(reason) ?? reason.replace(/_/g, ' '),
        count,
        percent: percentOf(count, totalCount),
        fill: DISTRIBUTION_CHART_COLORS[index % DISTRIBUTION_CHART_COLORS.length],
      }))
      .sort((a, b) => b.count - a.count);

    const byRequestType = (['within_window', 'after_window', 'cashier'] as RefundRequestType[])
      .map((type, index) => ({
        type,
        label: REQUEST_TYPE_LABELS[type],
        count: requestTypeCounts.get(type) ?? 0,
        percent: percentOf(requestTypeCounts.get(type) ?? 0, totalCount),
        fill: DISTRIBUTION_CHART_COLORS[index % DISTRIBUTION_CHART_COLORS.length],
      }))
      .filter((row) => row.count > 0);

    const byOrderMode = [...orderModeCounts.entries()]
      .map(([mode, count]) => ({
        mode,
        label: mode === 'DELIVERY' ? 'Delivery' : mode === 'TAKEAWAY' ? 'Pickup' : mode,
        count,
        percent: percentOf(count, totalCount),
      }))
      .sort((a, b) => b.count - a.count);

    const topProducts = [...productMap.entries()]
      .map(([productId, product]) => ({
        productId,
        productName: product.productName,
        imageUrl: product.imageUrl,
        refundCount: product.refundCount,
        percent: percentOf(product.refundCount, totalCount),
        refundAmountLkr: Math.round(product.refundAmountLkr),
      }))
      .sort((a, b) => b.refundCount - a.refundCount || b.refundAmountLkr - a.refundAmountLkr)
      .slice(0, 10);

    const dailyTrend = [...dailyTrendMap.entries()]
      .map(([date, bucket]) => ({
        date,
        count: bucket.count,
        amountLkr: bucket.amountLkr,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return success(res, {
      summary: {
        totalCount,
        totalRefundAmountLkr,
        avgRefundAmountLkr: totalCount > 0 ? Math.round(totalRefundAmountLkr / totalCount) : 0,
        avgRefundPercentage:
          refundPercentageCount > 0
            ? Math.round((refundPercentageSum / refundPercentageCount) * 10) / 10
            : null,
        completeCount,
        rejectedCount,
        pendingCount,
        completeRatePercent: percentOf(completeCount, totalCount),
        rejectionRatePercent: percentOf(rejectedCount, totalCount),
      },
      byCancelAtStatus,
      byReason,
      byRequestType,
      topProducts,
      dailyTrend,
      byOrderMode,
      avgProcessingHours:
        processingHoursCount > 0
          ? Math.round((processingHoursSum / processingHoursCount) * 10) / 10
          : null,
    });
  } catch (err) {
    next(err);
  }
}

export async function getRefunds(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      page = '1',
      limit = '20',
      ...filters
    } = req.query as Record<string, string>;

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (p - 1) * l;

    const where = buildRefundWhere(req, filters);
    await applyBranchRefundScope(req, where);

    const [refunds, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: l,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              total: true,
              subtotal: true,
              discount: true,
              loyaltyDiscount: true,
              status: true,
              paymentMethod: true,
              paymentStatus: true,
              orderMode: true,
              storeId: true,
              guestName: true,
              guestPhone: true,
              store: { select: { id: true, name: true, city: true } },
              user: { select: { id: true, name: true, phone: true } },
              statusEvents: {
                orderBy: { createdAt: 'asc' },
                select: { status: true, createdAt: true },
              },
            },
          },
        },
      }),
      prisma.refund.count({ where }),
    ]);

    const percentageMap = await getOrderStatusRefundPercentageMap();
    const enriched = await Promise.all(
      refunds.map((refund) => enrichRefundForDisplay(refund, { percentageMap })),
    );

    return paginated(res, enriched, total, p, l);
  } catch (err) {
    next(err);
  }
}

export async function getRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const refund = await prisma.refund.findUnique({
      where: { id: req.params.id as string },
      include: refundDetailInclude as unknown as Prisma.RefundInclude,
    });

    if (!refund) throw new AppError('Refund not found', 404);
    await assertOrderStoreAccess(req, refund.order.storeId);

    const enriched = await enrichRefundForDisplay(refund, { persistIfReceived: true });

    return success(res, enriched);
  } catch (err) {
    next(err);
  }
}

export async function updateRefundStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateRefundStatusSchema.parse(req.body);
    const refundId = req.params.id as string;

    const existing = await prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        order: {
          select: {
            id: true,
            storeId: true,
            paymentStatus: true,
            paymentMethod: true,
            orderMode: true,
            total: true,
            subtotal: true,
            discount: true,
            loyaltyDiscount: true,
            statusEvents: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });

    if (!existing) throw new AppError('Refund not found', 404);
    await assertOrderStoreAccess(req, existing.order.storeId);

    try {
      assertValidRefundStatusTransition(existing.status, body.status);
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : 'Invalid status transition', 400);
    }

    const admin = req.user?.type === 'admin'
      ? await prisma.adminUser.findUnique({
          where: { id: req.user.sub },
          select: { id: true, name: true },
        })
      : null;

    const now = new Date();
    const fullRefund = isFullRefund(existing);

    let refundPercentage = existing.refundPercentage;
    let refundAmount = existing.refundAmount;
    let completeSalesTotal = existing.salesTotal;

    if (body.status === 'COMPLETE') {
      if (fullRefund) {
        if (body.refundAmount != null && body.refundAmount !== existing.orderTotal) {
          throw new AppError('Full refund amount must match the order total', 400);
        }
        refundPercentage = 100;
        refundAmount = existing.orderTotal;
      } else {
        let resolved: { refundPercentage: number; refundAmount: number; salesTotal: number };
        try {
          resolved = await resolvePartialRefundValues({
            refundPercentage: existing.refundPercentage,
            refundAmount: existing.refundAmount,
            salesTotal: existing.salesTotal,
            cancelledAtStatus: (existing as { cancelledAtStatus?: string | null }).cancelledAtStatus ?? null,
            configuredStatusRefundPercentage: (existing as { configuredStatusRefundPercentage?: number | null }).configuredStatusRefundPercentage ?? null,
            order: existing.order,
          });
        } catch (e) {
          throw new AppError(
            e instanceof Error ? e.message : 'Refund percentage has not been set for this partial refund',
            400,
          );
        }
        refundPercentage = resolved.refundPercentage;
        refundAmount = resolved.refundAmount;
        completeSalesTotal = resolved.salesTotal;

        if (body.refundPercentage != null && body.refundPercentage !== refundPercentage) {
          throw new AppError('Refund percentage is fixed by order status and cannot be changed', 400);
        }
        if (body.refundAmount != null && body.refundAmount !== refundAmount) {
          throw new AppError('Refund amount is fixed by order status and cannot be changed', 400);
        }

        if (refundAmount < 0 || refundAmount > completeSalesTotal) {
          throw new AppError('Refund amount cannot exceed the sales total', 400);
        }
      }
    }

    if (body.status === 'REJECTED' && !body.adminNotes?.trim()) {
      throw new AppError('A rejection reason is required', 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data: Prisma.RefundUpdateInput = {
        status: body.status,
        adminNotes: body.adminNotes ?? existing.adminNotes,
      };

      if (body.status === 'COMPLETE') {
        data.refundPercentage = refundPercentage;
        data.refundAmount = refundAmount;
        data.configuredStatusRefundPercentage = refundPercentage;
        data.salesTotal = completeSalesTotal;
        data.processedByAdminId = admin?.id ?? req.user?.sub ?? null;
        data.processedAt = now;

        const paymentStructure = buildRefundPaymentStructure({
          submittedBy: existing.submittedBy,
          cancelledWithinWindow: existing.cancelledWithinWindow,
          refundPercentage: refundPercentage ?? 0,
          salesTotal: completeSalesTotal,
          deliveryFee: existing.deliveryFee,
          convenienceFee: existing.convenienceFee,
          orderTotal: existing.orderTotal,
          paymentMethod: existing.order.paymentMethod,
          orderMode: existing.order.orderMode,
        });

        data.returningSubtotal = paymentStructure.returningSubtotal;
        data.notReturningSubtotal = paymentStructure.notReturningSubtotal;
        data.returningDeliveryFee = paymentStructure.returningDeliveryFee;
        data.returningConvenienceFee = paymentStructure.returningConvenienceFee;
        data.nonRefundableDeliveryFee = paymentStructure.nonRefundableDeliveryFee;
        data.nonRefundableConvenienceFee = paymentStructure.nonRefundableConvenienceFee;
        data.additionalGatewayFee = paymentStructure.additionalGatewayFee;

        await tx.order.update({
          where: { id: existing.order.id },
          data: { paymentStatus: 'REFUNDED' },
        });
      }

      if (body.status === 'REJECTED') {
        data.processedByAdminId = admin?.id ?? req.user?.sub ?? null;
        data.processedAt = now;

        const rejectedSalesTotal = resolveEffectiveSalesTotal(existing);
        data.salesTotal = rejectedSalesTotal;

        const paymentStructure = buildRejectedRefundPaymentStructure({
          salesTotal: rejectedSalesTotal,
          deliveryFee: existing.deliveryFee,
          convenienceFee: existing.convenienceFee,
        });

        data.returningSubtotal = paymentStructure.returningSubtotal;
        data.notReturningSubtotal = paymentStructure.notReturningSubtotal;
        data.returningDeliveryFee = paymentStructure.returningDeliveryFee;
        data.returningConvenienceFee = paymentStructure.returningConvenienceFee;
        data.nonRefundableDeliveryFee = paymentStructure.nonRefundableDeliveryFee;
        data.nonRefundableConvenienceFee = paymentStructure.nonRefundableConvenienceFee;
        data.additionalGatewayFee = paymentStructure.additionalGatewayFee;
      }

      const refund = await tx.refund.update({
        where: { id: refundId },
        data,
        include: refundDetailInclude as unknown as Prisma.RefundInclude,
      });

      return refund;
    });

    return success(res, updated);
  } catch (err) {
    next(err);
  }
}
