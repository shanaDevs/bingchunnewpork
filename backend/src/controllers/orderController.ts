import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ORDER_LIST_SCALARS } from '../lib/orderListSelect';
import { success, paginated } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import {
  acquireOrderIdempotencySessionLock,
  releaseOrderIdempotencySessionLock,
} from '../lib/orderIdempotency';
import { generateOrderNumber } from '../utils/orderNumber';
import { generateTrackToken, resolveOrderAccess, toPublicOrderView, buildOrderTrackPath, readTrackToken, orderIdentifierWhere } from '../lib/orderAccess';
import { claimProcessedBy, nestedOrderStatusEvent, orderStatusEventData, resolveOrderActor, stripStaffAttribution } from '../lib/orderActor';
import { getPaymentAdapter } from '../integrations/paymentAdapter';
import { assertPaymentMethodAllowed, getPaymentSettings } from '../lib/paymentSettings';
import { mapNotifyOrderItems, notifyBranchNewOrder } from '../lib/branchNotifications';
import { notifyCustomerOrderStatus, notifyCustomerOrderPlaced } from '../lib/customerNotifications';
import { orderSmsPhone, sendOrderConfirmationSms, sendOrderReceiptSms } from '../integrations/smsAdapter';
import { sendOrderConfirmationEmail } from '../integrations/emailAdapter';
import { config } from '../config';
import QRCode from 'qrcode';
import { calcLoyaltyPointsEarned, calcLoyaltyRedeem, isCheckoutRedeemUnlocked, resolveLoyaltySettings } from '../lib/loyalty';
import { fetchLoyaltySettingRow } from '../lib/loyaltySettingStore';
import { assertOrderStoreAccess, requireBranchStoreId, isBranchScopedRole } from '../middleware/auth';
import { computeUnitPrice, batchResolveLinePricing } from '../lib/pricing';
import { getOrderPaymentFailureReason, stampCancelWindowStart, getCancelWindowStartsAt, getCancelWindowStartsAtMap } from '../lib/orderSchema';
import { resolveDeliveryValidation, DELIVERY_MIN_ORDER } from '../lib/deliveryFee';
import { createdAtRangeFromDateStrings } from '../lib/dashboardStatsDateRange';
import { upsertUserDeliveryAddress } from '../lib/userAddresses';
import { normalizePhone, phoneLookupVariants } from '../utils/phone';
import {
  initialPaymentStatus,
  appliesConvenienceFee,
  convenienceFeeRateForOrder,
  isOnlinePaymentMethod,
  paymentStatusOnOrderStatus,
  fulfillmentQueuePaymentWhere,
  shouldDeductStockOnOrderCreate,
  shouldCreditWalletOnOrderCreate,
  type FulfillmentQueueKind,
  canAdminEditOrder,
  canAdminAddOrderItems,
  shouldFreezeConvenienceFeeOnItemEdit,
  adminOrderEditMode,
  adminEditOrderDeniedMessage,
  orderBalanceDue,
} from '../lib/orderPayment';
import {
  assignTakeawayQueueSlot,
  getTakeawayQueue,
  reorderTakeawayQueue,
} from '../lib/takeawayQueue';
import { creditWalletForOrder, creditWalletAddonPayment } from './walletController';
import { processPayHerePaymentNotification, confirmPayherePopupPayment } from '../lib/payherePayment';
import { readOnlineChargeAmount } from '../lib/webxpayPayment';
import { assertValidStatusTransition, INITIAL_ORDER_STATUS, type OrderStatus } from '../lib/orderStatus';
import { formatTime } from '../lib/datetime';
import {
  maybeAutoCompleteDeliveryJobsForOrder,
  incrementJobRiderRating,
  syncJobDeliveryEventForOrderStatus,
} from '../lib/deliveryJobHelpers';
import { notifyDriverOrderCancelled } from '../lib/driverOrderAlerts';
import { compensateFailedPlaceOrder } from '../lib/orderPlacementReversal';
import { buildPromotionUsageRecord, assertPromoRedemptionAllowed, isPromoAvailableAtStore, parsePromoUsageLimits, positiveCost, resolveSharePercentagesForStore, type AppliedPromoSnapshot, type PromoCartLine } from '../lib/promotionUsage';
import { applyLoyaltyCartDiscount, overlayNcjCampaignShares } from '../lib/orderPromoApply';
import { findPromoForSpinOffer, isSpinLinkedPromo, syncSpinOfferToPromo } from '../lib/spinOfferPromo';
import { evaluateLoyaltyForStore, isLoyaltyPromoCode } from '../lib/loyaltyCampaign';
import { evaluatePromoAgainstCart, extractGiftFromPromotionRules } from '../lib/promotionCartEligibility';
import { assertCustomerPromoEligibility, assertCustomerPromoEligibilityInTx } from '../lib/referral';
import { assertLoyaltyOfferCodeStillValidInTx } from '../lib/loyaltyCampaign';
import { randomUUID } from 'crypto';
import { normalizeOrderItemImages } from '../lib/productImages';
import { logger } from '../utils/logger';
import { getLiveDeliveryCode } from '../lib/deliveryCodeLive';
import { fetchDeliveryTrackingFromService } from '../lib/deliveryTrackingClient';
import {
  publishOrderCancelledEvent,
  publishOrderStatusChangedEvent,
} from '../lib/publishOrderIntegrationEvent';
import { getAssignedDriverPublic, getLiveTrackingForOrder } from '../lib/liveDriverTracking';
import {
  deductOrderItemsOnce,
  restoreOrderItems,
  orderStockWasDeducted,
  checkAndEmitThresholds,
} from '../lib/stockEngine';
import {
  consumeFifo,
  getEffectiveThresholds,
} from '../lib/batchStockEngine';
import { validateStockAvailabilityInTx } from '../repositories/inventoryReservationRepository';
import { payhereNotifyBodySchema } from '../lib/httpSchemas';
import { resolveFrontendUrl } from '../lib/resolveFrontendUrl';
import { buildPayhereReturnUrl, payhereNotifyUrl } from '../lib/payhereUrls';
import { validateScheduledAt, isCustomScheduledAt } from '../lib/orderSchedule';
import {
  isOnlineOrderingOpen,
  onlineOrderingClosedMessage,
  isBranchManuallyClosed,
  branchManuallyClosedMessage,
  isCustomerOnlineOrderingOpen,
  customerOnlineOrderingClosedMessage,
  resolveStoreOrderingHours,
} from '../lib/storeOrderingHours';
import { fetchStoreOrderingHours } from '../lib/storeOrderingSchema';
import { computeConvenientFee, getConvenienceFeeRates, getPickupOrderEditSettings, getCancelWindowMinutes, type PickupOrderEditSettings } from '../lib/appSchema';
import {
  OTHER_CANCEL_REASON_VALUE,
  validateActiveCancellationReason,
} from '../lib/cancelReasonConfig';
import {
  isPlaceholderCustomerName,
  resolveCustomerDisplayName,
  resolveOrderContactName,
} from '../lib/customerName';
import {
  createCheckoutReservation,
  validateAndLinkReservationToOrder,
  InsufficientStockError,
} from '../services/inventoryReservationService';
import { notifyMessagingOrderStatus } from '../services/messaging/messagingNotificationService';
import {
  buildCustomerCancelNote,
  getCustomerCancelEligibility,
  withCustomerCancelRefundFields,
  withCustomerCancelRefundFieldsAsync,
} from '../lib/orderCancel';
import {
  createRefundForCancelledOrder,
  isOnlinePaidOrder,
  mapAdminCancelReasonToRefundReason,
} from '../lib/refundCreate';
import { getRefundPercentageForStatus, getOrderStatusRefundPercentageMap } from '../lib/orderStatusRefundConfig';


const customerCancelSchema = z.object({
  cancellationReason: z.string().min(1).max(64),
  customReasonText: z.string().max(500).optional(),
});

type OrderCancelFieldsInput = {
  orderId?: string;
  status: string;
  createdAt: Date;
  cancelWindowStartsAt?: Date | null;
  total: number;
  subtotal: number;
  discount: number;
  loyaltyDiscount: number;
  deliveryFee: number;
  convenientFee: number;
  paymentMethod: string;
  paymentStatus: string;
};

async function attachCustomerCancelFields(order: OrderCancelFieldsInput) {
  const cancelWindowMinutes = await getCancelWindowMinutes();
  const cancelWindowStartsAt = order.cancelWindowStartsAt
    ?? (order.orderId ? await getCancelWindowStartsAt(order.orderId) : null);
  return withCustomerCancelRefundFieldsAsync(
    {
      ...order,
      cancelWindowStartsAt,
    },
    cancelWindowMinutes,
    getRefundPercentageForStatus,
  );
}

const placeOrderItemSchema = z.object({
  productId: z.string(),
  size: z.enum(['REGULAR', 'LARGE']).default('REGULAR'),
  toppingIds: z.array(z.string()).default([]),
  quantity: z.number().int().min(1),
});

const placeOrderSchema = z.object({
  orderMode: z.enum(['DELIVERY', 'TAKEAWAY']),
  storeId: z.string(),
  deliveryZoneId: z.string().optional(),
  addressId: z.string().optional(),
  items: z.array(placeOrderItemSchema).optional(),
  deliveryAddress: z.object({
    addressLine: z.string(),
    city: z.string(),
    district: z.string(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }).optional(),
  paymentMethod: z.enum(['CARD', 'PAYHERE', 'CASH_AT_COUNTER', 'LOYALTY_POINTS']),
  promoCode: z.string().optional(),
  /** When true, do not silently re-apply loyalty journey offers after the shopper removed them. */
  skipLoyaltyAutoApply: z.boolean().optional(),
  usePoints: z.number().int().min(0).optional(),
  pickupTime: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  scheduleMode: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal('custom')]).optional(),
  notes: z.string().optional(),
  guestName: z.string().optional(),
  guestPhone: z.string().optional(),
  guestEmail: z.union([z.string().email(), z.literal('')]).optional(),
  frontendOrigin: z.string().optional(),
  reservationUuid: z.string().uuid().optional(),
  platform: z.number().int().min(0).max(1).optional().default(0),
  /** Sales channel — WEB (default), APP, POS, WHATSAPP, TELEGRAM */
  channel: z.enum(['WEB', 'APP', 'POS', 'WHATSAPP', 'TELEGRAM']).optional().default('WEB'),
});

const updateOrderItemEntrySchema = z.union([
  z.object({
    orderItemId: z.string().uuid(),
    quantity: z.number().int().min(1),
  }),
  placeOrderItemSchema,
]);

const updateOrderItemsSchema = z.object({
  items: z.array(updateOrderItemEntrySchema).min(1),
});

const orderDetailInclude = {
  items: {
    include: {
      toppings: true,
      product: { select: { imageUrl: true } },
    },
  },
  statusEvents: { orderBy: { createdAt: 'asc' as const } },
  store: { select: { id: true, name: true, addressLine: true, lat: true, lng: true } },
  address: true,
  user: { select: { name: true, phone: true } },
  platformRating: { select: { stars: true, comment: true, createdAt: true } },
  riderRating: { select: { stars: true, comment: true, createdAt: true } },
  refund: true,
};

function withPlatformRating<T extends {
  platformRating?: { stars: number; comment: string | null; createdAt: Date } | null;
  riderRating?: { stars: number; comment: string | null; createdAt: Date } | null;
}>(
  order: T,
) {
  const { platformRating, riderRating, ...rest } = order;
  return {
    ...rest,
    platformRating: platformRating
      ? {
          stars: platformRating.stars,
          comment: platformRating.comment,
          createdAt: platformRating.createdAt.toISOString(),
        }
      : null,
    riderRating: riderRating
      ? {
          stars: riderRating.stars,
          comment: riderRating.comment,
          createdAt: riderRating.createdAt.toISOString(),
        }
      : null,
  };
}

const orderCreateInclude = {
  items: {
    include: {
      toppings: true,
      product: { select: { imageUrl: true } },
    },
  },
  store: { select: { name: true } },
};

function withAdminOrderFlags(
  order: {
    orderMode: string;
    paymentMethod: import('@prisma/client').PaymentMethod;
    paymentStatus: string;
    status: string;
    total: number;
    prepaidAmount: number;
    [key: string]: unknown;
  },
  pickupSettings: PickupOrderEditSettings,
) {
  const editMode = adminOrderEditMode(order, pickupSettings);
  return {
    ...order,
    canEdit: editMode === 'full',
    canAddItems: editMode === 'add_only',
    editMode,
    balanceDue: orderBalanceDue(order),
  };
}

type ResolvedCartLine = {
  productId: string;
  product: { id: string; name: string };
  size: string;
  quantity: number;
  unitPrice: number;
  toppings: { toppingId: string; topping: { id: string; name: string; extraPrice: number } }[];
};

async function resolveCartLines(
  userId: string | undefined,
  payloadItems: z.infer<typeof placeOrderItemSchema>[] | undefined
): Promise<ResolvedCartLine[]> {
  if (payloadItems?.length) {
    const pricing = await batchResolveLinePricing(
      payloadItems.map((item) => ({
        productId: item.productId,
        size: item.size,
        toppingIds: item.toppingIds,
      })),
    );

    const productIds = [...new Set(payloadItems.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, isAvailable: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const lines: ResolvedCartLine[] = [];
    for (const item of payloadItems) {
      const key = `${item.productId}:${item.size}:${item.toppingIds.join(',')}`;
      const priced = pricing.get(key);
      if (!priced) throw new AppError(`Product not found: ${item.productId}`, 400);

      const product = productMap.get(item.productId);
      if (!product) throw new AppError(`Product not found: ${item.productId}`, 400);
      if (!product.isAvailable) throw new AppError(`${product.name} is currently unavailable`, 400);

      lines.push({
        productId: item.productId,
        product: { id: product.id, name: product.name },
        size: item.size,
        quantity: item.quantity,
        unitPrice: priced.unitPrice,
        toppings: priced.toppings,
      });
    }
    return lines;
  }

  if (!userId) throw new AppError('Cart is empty — add items before checkout', 400);

  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: true,
          toppings: { include: { topping: true } },
        },
      },
    },
  });

  const cartItems = cart?.items || [];
  if (!cartItems.length) return [];

  const pricing = await batchResolveLinePricing(
    cartItems.map((item) => ({
      productId: item.productId,
      size: item.size,
      toppingIds: item.toppings.map((t) => t.toppingId),
    })),
  );

  return cartItems.map((item) => {
    const toppingIds = item.toppings.map((t) => t.toppingId);
    const key = `${item.productId}:${item.size}:${toppingIds.join(',')}`;
    const priced = pricing.get(key);
    if (!priced) throw new AppError(`Product not found: ${item.productId}`, 400);
    if (!item.product.isAvailable) {
      throw new AppError(`${item.product.name} is currently unavailable`, 400);
    }
    return {
      productId: item.productId,
      product: { id: item.product.id, name: item.product.name },
      size: item.size,
      quantity: item.quantity,
      unitPrice: priced.unitPrice,
      toppings: priced.toppings,
    };
  });
}

async function buildPromoCartLines(lines: ResolvedCartLine[]): Promise<PromoCartLine[]> {
  if (!lines.length) return [];
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { category: { select: { name: true } } },
  });
  const categoryByProduct = new Map(products.map((p) => [p.id, p.category?.name]));
  return lines.map((line) => ({
    productId: line.productId,
    productName: line.product.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.unitPrice * line.quantity,
    categoryName: categoryByProduct.get(line.productId),
  }));
}

function resolvePublicOrderChannel(data: { channel?: string; platform?: number }): 'WEB' | 'APP' {
  if (data.platform === 1 || data.channel === 'APP') return 'APP';
  return 'WEB';
}

function requiresCheckoutIdempotency(data: { channel?: string }): boolean {
  const channel = (data.channel ?? 'WEB').toUpperCase();
  return channel !== 'POS' && channel !== 'WHATSAPP' && channel !== 'TELEGRAM';
}

const WALK_IN_PLACEHOLDER_PHONE = '0700000000';

/** Guest checkout idempotency binds on a real phone, not the shared walk-in placeholder. */
function guestPhonesMatchForIdempotency(
  callerPhone: string | undefined,
  orderGuestPhone: string | null | undefined,
): boolean {
  if (!callerPhone || !orderGuestPhone) return false;
  const a = normalizePhone(callerPhone);
  const b = normalizePhone(orderGuestPhone);
  if (a !== b) return false;
  if (a === WALK_IN_PLACEHOLDER_PHONE) return false;
  return true;
}

export async function placeOrder(req: Request, res: Response, next: NextFunction) {
  let idempotencyLockKey: string | undefined;
  try {
    const data = placeOrderSchema.parse(req.body);
    const customerUserId = req.user?.type === 'user' ? req.user.sub : undefined;
    const publicChannel = resolvePublicOrderChannel(data);
    const idempotencyKey =
      typeof req.headers['idempotency-key'] === 'string'
        ? req.headers['idempotency-key'].trim().slice(0, 128) || undefined
        : undefined;

    if (requiresCheckoutIdempotency(data) && !idempotencyKey) {
      throw new AppError('Idempotency-Key header is required', 400, 'IDEMPOTENCY_KEY_REQUIRED');
    }

    if (idempotencyKey) {
      idempotencyLockKey = idempotencyKey;
      await acquireOrderIdempotencySessionLock(idempotencyKey);
    }

    if (idempotencyKey && customerUserId) {
      const existing = await prisma.order.findFirst({
        where: { idempotencyKey },
        include: orderCreateInclude,
      });
      if (existing?.userId === customerUserId) {
        return success(res, { order: existing }, 200);
      }
    }
    const guestEmail = data.guestEmail === '' ? undefined : data.guestEmail;
    const authUser = customerUserId
      ? await prisma.user.findFirst({
          where: { id: customerUserId, deletedAt: null, bannedAt: null },
          select: { name: true, phone: true, email: true },
        })
      : null;
    if (customerUserId && !authUser) {
      const banned = await prisma.user.findFirst({
        where: { id: customerUserId, bannedAt: { not: null } },
        select: { id: true, bannedReason: true },
      });
      if (banned) {
        throw new AppError(
          `This account has been suspended: ${banned.bannedReason || 'Please contact support.'}`,
          403,
          'ACCOUNT_BANNED',
        );
      }
      const deleted = await prisma.user.findFirst({
        where: { id: customerUserId, deletedAt: { not: null } },
        select: { id: true },
      });
      if (deleted) {
        throw new AppError(
          'This account has been deleted. You cannot place orders.',
          403,
          'ACCOUNT_DELETED',
        );
      }
      throw new AppError('Your session has expired. Please sign in again.', 401);
    }
    const bodyName = data.guestName?.trim();
    const bodyPhone = data.guestPhone ? normalizePhone(data.guestPhone) : undefined;
    let guestName = resolveOrderContactName(bodyName, authUser?.name);
    let guestPhone = bodyPhone || (authUser?.phone ? normalizePhone(authUser.phone) : undefined);

    if (idempotencyKey && !customerUserId && guestPhone) {
      const existingGuest = await prisma.order.findFirst({
        where: { idempotencyKey },
        include: orderCreateInclude,
      });
      if (
        existingGuest &&
        guestPhonesMatchForIdempotency(guestPhone, existingGuest.guestPhone)
      ) {
        return success(res, { order: existingGuest }, 200);
      }
    }

    if (data.orderMode === 'DELIVERY') {
      if (!guestName || !guestPhone) {
        throw new AppError('Customer name and phone are required for delivery orders', 400);
      }
    } else if (!guestName || !guestPhone) {
      guestName = guestName || 'Walk-in';
      guestPhone = guestPhone || WALK_IN_PLACEHOLDER_PHONE;
    }

    let resolvedUserId = customerUserId;
    if (!resolvedUserId && guestPhone && guestPhone !== WALK_IN_PLACEHOLDER_PHONE) {
      const variants = phoneLookupVariants(guestPhone);
      const existingUser = await prisma.user.findFirst({
        where: { phone: { in: variants }, deletedAt: null },
        select: { id: true, bannedAt: true, bannedReason: true },
      });
      if (existingUser?.bannedAt) {
        throw new AppError(
          `This account has been suspended: ${existingUser.bannedReason || 'Please contact support.'}`,
          403,
          'ACCOUNT_BANNED',
        );
      }
      if (existingUser) resolvedUserId = existingUser.id;
    }

    if (resolvedUserId) {
      const linkedUser = await prisma.user.findFirst({
        where: { id: resolvedUserId, deletedAt: null, bannedAt: null },
        select: { id: true },
      });
      if (!linkedUser) resolvedUserId = undefined;
    }

    // Upgrade placeholder OTP account names when checkout provides a real name.
    if (
      resolvedUserId &&
      guestName &&
      !isPlaceholderCustomerName(guestName) &&
      isPlaceholderCustomerName(authUser?.name)
    ) {
      await prisma.user.update({
        where: { id: resolvedUserId },
        data: { name: guestName },
      });
    }

    if (data.orderMode === 'DELIVERY' && !data.deliveryAddress) {
      throw new AppError('Delivery address is required', 400);
    }

    const cartItems = await resolveCartLines(customerUserId, data.items);
    if (cartItems.length === 0) throw new AppError('Cart is empty', 400);

    let fulfillingStoreId = data.storeId;
    let deliveryZoneId: string | null = data.deliveryZoneId ?? null;
    let deliveryFee = 0;

    if (data.orderMode === 'DELIVERY') {
      const { lat, lng } = data.deliveryAddress ?? {};
      if (lat == null || lng == null) {
        throw new AppError('Delivery coordinates are required', 400);
      }

      const deliveryCheck = await resolveDeliveryValidation(lat, lng, data.storeId);
      if (!deliveryCheck.eligible || !deliveryCheck.store || !deliveryCheck.zone) {
        throw new AppError(
          deliveryCheck.message || 'Delivery is not available to this address',
          400,
        );
      }

      fulfillingStoreId = deliveryCheck.store.id;
      deliveryFee = deliveryCheck.zone.fee;
      deliveryZoneId = null;
    } else {
      const store = await prisma.store.findUnique({
        where: { id: data.storeId, isActive: true },
      });
      if (!store) throw new AppError('Store not found or inactive', 400);
      fulfillingStoreId = store.id;
    }

    const store = await prisma.store.findUnique({
      where: { id: fulfillingStoreId, isActive: true },
    });
    if (!store) throw new AppError('Store not found or inactive', 400);
    const orderingRow = await fetchStoreOrderingHours(store.id);
    const storeWithHours = orderingRow ? { ...store, ...orderingRow } : store;
    if (data.orderMode === 'DELIVERY' && !storeWithHours.deliveryEnabled) {
      throw new AppError('Delivery is not available for this branch. Please choose Takeaway.', 400);
    }
    if (data.channel === 'POS') {
      if (!isOnlineOrderingOpen(storeWithHours)) {
        throw new AppError(onlineOrderingClosedMessage(storeWithHours), 400);
      }
    } else {
      if (isBranchManuallyClosed(storeWithHours)) {
        throw new AppError(branchManuallyClosedMessage(), 400);
      }
      if (!isCustomerOnlineOrderingOpen(storeWithHours)) {
        throw new AppError(customerOnlineOrderingClosedMessage(storeWithHours), 400);
      }
    }

    const orderingHours = resolveStoreOrderingHours(storeWithHours);
    const scheduleCheck =
      data.orderMode === 'DELIVERY'
        ? ({ ok: true, date: null } as const)
        : validateScheduledAt(
            data.scheduledAt,
            orderingHours.scheduleOpenTime,
            orderingHours.scheduleCloseTime,
            new Date(),
            data.scheduleMode,
            orderingHours.pickupCutoffMinutes,
          );
    if (scheduleCheck.ok === false) throw new AppError(scheduleCheck.error, 400);
    const requestedPickupAt = scheduleCheck.date;

    if (
      requestedPickupAt &&
      isCustomScheduledAt(
        data.scheduledAt,
        orderingHours.scheduleOpenTime,
        orderingHours.scheduleCloseTime,
        new Date(),
        data.scheduleMode,
        orderingHours.pickupCutoffMinutes,
      ) &&
      !isOnlinePaymentMethod(data.paymentMethod)
    ) {
      throw new AppError('Custom scheduled orders must be paid online before placing', 400);
    }

    // Calculate subtotal
    const subtotal = cartItems.reduce((sum: number, i: any) => sum + i.unitPrice * i.quantity, 0);

    await assertPaymentMethodAllowed(data.paymentMethod, data.orderMode, subtotal);

    if (data.orderMode === 'DELIVERY') {
      if (subtotal < DELIVERY_MIN_ORDER) {
        throw new AppError(`Minimum order for delivery is LKR ${DELIVERY_MIN_ORDER}`, 400);
      }
    }

    // Promo code or spin-wheel claim
    let discount = 0;
    let consumePromoId: string | null = null;
    let promoEligibilityForTx: {
      id: string;
      code?: string | null;
      promotionKind?: string | null;
      usageLimits?: unknown;
    } | null = null;
    const promoCartLines = await buildPromoCartLines(cartItems);
    let appliedPromo: AppliedPromoSnapshot | null = null;
    let spinResultId: string | undefined;
    let giftNote: string | undefined;
    let giftProductId: string | undefined;
    let giftCostForUsage: number | undefined;

    if (data.promoCode) {
      if (isLoyaltyPromoCode(data.promoCode)) {
        if (!resolvedUserId) {
          throw new AppError('Sign in to use loyalty offers', 401);
        }
        const loyaltyEval = await evaluateLoyaltyForStore({
          storeId: fulfillingStoreId,
          subtotal,
          userId: resolvedUserId,
          channel: resolvePublicOrderChannel(data),
        });
        const loyaltyDiscountOffer = loyaltyEval.cartDiscount;
        if (!loyaltyDiscountOffer || loyaltyDiscountOffer.code !== data.promoCode.trim().toUpperCase()) {
          throw new AppError('This loyalty offer is not available for your order', 400);
        }
        const loyaltyApplied = applyLoyaltyCartDiscount(loyaltyDiscountOffer, fulfillingStoreId);
        discount = loyaltyApplied.discount;
        giftProductId = loyaltyApplied.giftProductId;
        giftNote = loyaltyApplied.giftNote;
        giftCostForUsage = loyaltyApplied.giftCostForUsage;
        appliedPromo = loyaltyApplied.appliedPromo;
      } else {
      const spinClaim = await prisma.spinResult.findUnique({
        where: { claimCode: data.promoCode },
        include: {
          offer: {
            include: {
              giftProduct: { select: { id: true, name: true, basePrice: true, isAvailable: true } },
            },
          },
        },
      });

      if (spinClaim) {
        if (spinClaim.status !== 'CLAIMED') throw new AppError('Spin reward already used or invalid', 400);
        if (spinClaim.expiresAt < new Date()) throw new AppError('Spin reward has expired', 400);
        if (spinClaim.offer.offerType === 'NO_PRIZE') throw new AppError('No prize to apply', 400);
        if (subtotal < spinClaim.offer.minOrderValue) {
          throw new AppError(`Minimum order LKR ${spinClaim.offer.minOrderValue} required for this reward`, 400);
        }

        const offer = spinClaim.offer;
        if (offer.offerType === 'PERCENTAGE') {
          discount = Math.min(subtotal, Math.floor((subtotal * offer.discountValue) / 100));
        } else if (offer.offerType === 'FIXED') {
          discount = Math.min(subtotal, offer.discountValue);
        } else if (offer.offerType === 'FREE_DELIVERY') {
          if (data.orderMode !== 'DELIVERY') {
            throw new AppError('Free delivery reward applies to delivery orders only', 400);
          }
          deliveryFee = 0;
        } else if (offer.offerType === 'GIFT') {
          if (offer.giftProductId && offer.giftProduct) {
            if (!offer.giftProduct.isAvailable) {
              throw new AppError('Gift product is currently unavailable', 400);
            }
            giftProductId = offer.giftProduct.id;
            giftNote = `Free ${offer.giftProduct.name}`;
            giftCostForUsage = positiveCost(offer.giftProduct.basePrice);
          } else {
            giftNote = offer.description || offer.label;
          }
        }
        spinResultId = spinClaim.id;
        await syncSpinOfferToPromo(offer).catch(() => undefined);
        const linkedPromo = await findPromoForSpinOffer(offer.id);
        if (linkedPromo) {
          const linkedShares = resolveSharePercentagesForStore(
            linkedPromo.ownership,
            fulfillingStoreId,
            linkedPromo.branchSharePct ?? null,
            linkedPromo.platformSharePct ?? null,
            (linkedPromo as { branchShareSplits?: unknown }).branchShareSplits,
          );
          const spinPromo: AppliedPromoSnapshot = {
            id: linkedPromo.id,
            code: data.promoCode,
            ownership: linkedPromo.ownership,
            contributionSource: (linkedPromo as { contributionSource?: string | null }).contributionSource ?? 'JASON',
            branchSharePct: linkedShares.branchSharePct,
            platformSharePct: linkedShares.platformSharePct,
            promotionKind: linkedPromo.promotionKind,
            promotionRules: linkedPromo.promotionRules,
            discountType: linkedPromo.discountType,
            discountValue: linkedPromo.discountValue,
          };
          const ncjEval = await evaluateLoyaltyForStore({
            storeId: fulfillingStoreId,
            subtotal: 0,
            userId: resolvedUserId ?? undefined,
          });
          appliedPromo = overlayNcjCampaignShares(
            spinPromo,
            ncjEval.campaign,
            fulfillingStoreId,
          );
          consumePromoId = linkedPromo.id;
          promoEligibilityForTx = {
            id: linkedPromo.id,
            code: linkedPromo.code,
            promotionKind: linkedPromo.promotionKind,
            usageLimits: (linkedPromo as { usageLimits?: unknown }).usageLimits,
          };
        }
      } else {
        const promo = await prisma.promoCode.findUnique({
          where: { code: data.promoCode },
        });
        if (!promo || !promo.isActive) throw new AppError('Invalid or expired promo code', 400);
        if (isSpinLinkedPromo(promo)) {
          throw new AppError('Spin the wheel to unlock this offer, then apply your SPIN reward at checkout', 400);
        }
        if (promo.expiresAt && promo.expiresAt < new Date()) throw new AppError('Promo code has expired', 400);
        assertPromoRedemptionAllowed(promo);
        if (subtotal < promo.minOrderValue) throw new AppError(`Minimum order LKR ${promo.minOrderValue} required for this code`, 400);
        if (!isPromoAvailableAtStore((promo as { storeIds?: unknown }).storeIds, fulfillingStoreId)) {
          throw new AppError('This promo code is not available at the selected branch', 400);
        }
        await assertCustomerPromoEligibility({
          promo: {
            id: promo.id,
            code: promo.code,
            promotionKind: promo.promotionKind,
            usageLimits: (promo as { usageLimits?: unknown }).usageLimits,
          },
          userId: resolvedUserId,
        });

        const cartEval = evaluatePromoAgainstCart({
          promotionKind: promo.promotionKind,
          promotionRules: promo.promotionRules,
          discountType: promo.discountType,
          discountValue: promo.discountValue,
          orderTotal: subtotal,
          cartItems: promoCartLines,
          orderMode: data.orderMode,
          code: promo.code,
        });
        if (!cartEval.eligible) {
          throw new AppError('This offer does not apply to your current order', 400);
        }

        if (cartEval.freeDelivery) {
          if (data.orderMode !== 'DELIVERY') {
            throw new AppError('Free delivery applies to delivery orders only', 400);
          }
          deliveryFee = 0;
          discount = 0;
        } else {
          discount = cartEval.discount;
        }

        const promoShares = resolveSharePercentagesForStore(
          promo.ownership,
          fulfillingStoreId,
          (promo as { branchSharePct?: number | null }).branchSharePct ?? null,
          (promo as { platformSharePct?: number | null }).platformSharePct ?? null,
          (promo as { branchShareSplits?: unknown }).branchShareSplits,
        );
        appliedPromo = {
          id: promo.id,
          code: promo.code,
          ownership: promo.ownership,
          contributionSource: (promo as { contributionSource?: string | null }).contributionSource ?? 'JASON',
          branchSharePct: promoShares.branchSharePct,
          platformSharePct: promoShares.platformSharePct,
          promotionKind: promo.promotionKind,
          promotionRules: promo.promotionRules,
          discountType: promo.discountType,
          discountValue: promo.discountValue,
        };
        consumePromoId = promo.id;
        promoEligibilityForTx = {
          id: promo.id,
          code: promo.code,
          promotionKind: promo.promotionKind,
          usageLimits: (promo as { usageLimits?: unknown }).usageLimits,
        };

        const gift = extractGiftFromPromotionRules(promo.promotionRules);
        if ((promo.promotionKind || '').toUpperCase() === 'GIFT_ITEM' && gift.giftProduct && !giftProductId) {
          const product = await prisma.product.findUnique({
            where: { id: gift.giftProduct.id },
            select: { id: true, name: true, isAvailable: true },
          });
          if (product?.isAvailable) {
            giftProductId = product.id;
            giftNote = `Free ${product.name}`;
          }
        }
      }
      }
    } else if (
      resolvedUserId
      && !(data.usePoints && data.usePoints > 0)
      && !data.skipLoyaltyAutoApply
    ) {
      const loyaltyEval = await evaluateLoyaltyForStore({
        storeId: fulfillingStoreId,
        subtotal,
        userId: resolvedUserId,
        channel: resolvePublicOrderChannel(data),
      });
      const loyaltyDiscountOffer = loyaltyEval.cartDiscount;
      if (loyaltyDiscountOffer?.offerKey === 'OFFER_1' || loyaltyDiscountOffer?.offerKey === 'OFFER_2') {
        const loyaltyApplied = applyLoyaltyCartDiscount(loyaltyDiscountOffer, fulfillingStoreId);
        discount = loyaltyApplied.discount;
        giftProductId = loyaltyApplied.giftProductId;
        giftNote = loyaltyApplied.giftNote;
        giftCostForUsage = loyaltyApplied.giftCostForUsage;
        appliedPromo = loyaltyApplied.appliedPromo;
      }
    }

    const feeRates = await getConvenienceFeeRates();
    const convenientFee =
      data.orderMode === 'TAKEAWAY'
        ? 0
        : appliesConvenienceFee(data.orderMode, data.paymentMethod as import('@prisma/client').PaymentMethod)
          ? computeConvenientFee(
              subtotal,
              convenienceFeeRateForOrder(data.orderMode, feeRates),
            )
          : 0;

    let loyaltyDiscount = 0;
    let loyaltyPointsToDeduct = 0;
    if (customerUserId && data.usePoints && data.usePoints > 0) {
      const promoApplied =
        Boolean(appliedPromo) ||
        Boolean(spinResultId) ||
        Boolean(data.promoCode && data.promoCode.trim());
      if (promoApplied) {
        throw new AppError('Promos and point redemption cannot be used on the same order', 400);
      }
      const loyaltyRow = await fetchLoyaltySettingRow();
      const setting = resolveLoyaltySettings(loyaltyRow);
      if (!setting.checkoutRedeemEnabled) {
        throw new AppError('Point redemption at checkout is currently unavailable', 400);
      }
      const lifetimeAgg = await prisma.loyaltyTransaction.aggregate({
        where: { userId: customerUserId, points: { gt: 0 } },
        _sum: { points: true },
      });
      const lifetimePointsEarned = lifetimeAgg._sum.points ?? 0;
      if (
        !isCheckoutRedeemUnlocked({
          lifetimePointsEarned,
          minPointsToRedeem: setting.minPointsToRedeem,
        })
      ) {
        throw new AppError(
          `Earn ${setting.minPointsToRedeem} points before you can redeem at checkout`,
          400,
        );
      }
      const user = await prisma.user.findUnique({
        where: { id: customerUserId },
        select: { loyaltyPoints: true },
      });
      if (user) {
        const remainingPayable = Math.max(0, subtotal + deliveryFee + convenientFee - discount);
        const redeemed = calcLoyaltyRedeem({
          usePoints: data.usePoints,
          availablePoints: user.loyaltyPoints,
          redeemValue: setting.redeemValue,
          maxRedeemPct: setting.maxRedeemPct,
          subtotal,
          remainingPayable,
        });
        loyaltyDiscount = redeemed.loyaltyDiscount;
        loyaltyPointsToDeduct = redeemed.pointsToDeduct;
      }
    }
    const total = Math.max(0, subtotal + deliveryFee + convenientFee - discount - loyaltyDiscount);
    const orderNumber = generateOrderNumber();
    const trackToken = generateTrackToken();

    // Link or snapshot delivery location for admin / drivers
    let addressId = data.addressId;
    let deliverySnapshot: {
      deliveryAddressLine?: string;
      deliveryCity?: string;
      deliveryDistrict?: string;
      deliveryLat?: number;
      deliveryLng?: number;
    } = {};

    if (data.orderMode === 'DELIVERY' && data.deliveryAddress) {
      deliverySnapshot = {
        deliveryAddressLine: data.deliveryAddress.addressLine,
        deliveryCity: data.deliveryAddress.city,
        deliveryDistrict: data.deliveryAddress.district,
        deliveryLat: data.deliveryAddress.lat,
        deliveryLng: data.deliveryAddress.lng,
      };

      if (resolvedUserId && !addressId) {
        try {
          const { address } = await upsertUserDeliveryAddress({
            userId: resolvedUserId,
            addressLine: data.deliveryAddress.addressLine,
            city: data.deliveryAddress.city,
            district: data.deliveryAddress.district,
            lat: data.deliveryAddress.lat,
            lng: data.deliveryAddress.lng,
          });
          addressId = address.id;
        } catch {
          // Order still proceeds with delivery snapshot even if the address book is full.
        }
      }
    }

    if (data.addressId) {
      if (!customerUserId) {
        throw new AppError('Sign in to use a saved address', 401);
      }
      const ownedAddress = await prisma.address.findFirst({
        where: { id: data.addressId, userId: customerUserId },
        select: { id: true },
      });
      if (!ownedAddress) {
        throw new AppError('Address not found', 404);
      }
      addressId = ownedAddress.id;
    }

    // Generate QR code for takeaway — encodes public track URL (no login)
    let qrCode: string | undefined;
    if (data.orderMode === 'TAKEAWAY') {
      const trackUrl = `${config.frontendUrl}${buildOrderTrackPath(trackToken)}`;
      qrCode = await QRCode.toDataURL(trackUrl);
    }

    const paidOnCreate = initialPaymentStatus(data.paymentMethod as any) === 'PAID';
    const isOnlinePayment =
      data.paymentMethod === 'PAYHERE' || data.paymentMethod === 'CARD';

    const stockLines = cartItems.map((i: any) => ({
      productId: i.productId,
      quantity: i.quantity,
      productName: i.product.name,
    }));
    if (giftProductId) {
      const giftProduct = await prisma.product.findUnique({
        where: { id: giftProductId },
        select: { name: true },
      });
      if (giftProduct) {
        stockLines.push({
          productId: giftProductId,
          quantity: 1,
          productName: `${giftProduct.name} (FREE)`,
        });
      }
    }

    let activeReservationUuid = data.reservationUuid;

    // Validate / create inventory reservations (online checkout holds stock for 10 minutes).
    if (activeReservationUuid) {
      // Reservation already created at checkout — validated when linked to order below.
    } else if (isOnlinePayment) {
      try {
        const session = await createCheckoutReservation({
          storeId: fulfillingStoreId,
          items: stockLines,
          userId: resolvedUserId,
        });
        activeReservationUuid = session.reservationUuid;
      } catch (stockErr) {
        if (stockErr instanceof InsufficientStockError) {
          throw new AppError(stockErr.message, 409);
        }
        throw stockErr;
      }
    } else {
      try {
        const reservationChannel = data.channel === 'POS' ? 'POS' : 'WEB';
        const session = await createCheckoutReservation({
          storeId: fulfillingStoreId,
          items: stockLines,
          userId: resolvedUserId,
          channel: reservationChannel,
        });
        activeReservationUuid = session.reservationUuid;
      } catch (stockErr) {
        if (stockErr instanceof InsufficientStockError) {
          throw new AppError(stockErr.message, 409);
        }
        throw new AppError(stockErr instanceof Error ? stockErr.message : 'Insufficient stock', 400);
      }
    }

    // Pickup and delivery orders always start as RECEIVED (store moves to PREPARING manually).
    const initialStatus = INITIAL_ORDER_STATUS;
    const orderNotes = [data.notes, giftNote ? `Spin gift: ${giftNote}` : null]
      .filter(Boolean)
      .join('\n') || undefined;

    const paymentSettings = await getPaymentSettings();
    const paymentGateway =
      data.paymentMethod === 'PAYHERE' || data.paymentMethod === 'CARD'
        ? paymentSettings.activeOnlineGateway
        : null;

    // Create order and consume promo / spin / loyalty in the same transaction.
    // The idempotency lock was already taken at the start of placeOrder.
    // Locking again uses another pooled connection and can wait until Postgres
    // closes that socket (P1017) because advisory locks are session-scoped.
    let order;
    try {
      order = await prisma.$transaction(async (tx) => {
      if (resolvedUserId) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${resolvedUserId}))`;
      } else if (guestPhone && guestPhone !== '0700000000') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guest:${guestPhone}`}))`;
      }

      if (consumePromoId && promoEligibilityForTx) {
        await assertCustomerPromoEligibilityInTx(tx, {
          promo: promoEligibilityForTx,
          userId: resolvedUserId ?? customerUserId,
        });
      }

      if (resolvedUserId && appliedPromo && isLoyaltyPromoCode(appliedPromo.code)) {
        await assertLoyaltyOfferCodeStillValidInTx(tx, {
          userId: resolvedUserId,
          promoCode: appliedPromo.code,
          storeId: fulfillingStoreId,
          subtotal,
          channel: publicChannel,
        });
      }

      const created = await tx.order.create({
      data: {
        orderNumber,
        trackToken,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        userId: resolvedUserId,
        guestName,
        guestPhone,
        guestEmail: authUser?.email ?? guestEmail,
        storeId: fulfillingStoreId,
        deliveryZoneId,
        addressId,
        ...deliverySnapshot,
        orderMode: data.orderMode,
        channel: resolvePublicOrderChannel(data),
        status: initialStatus,
        paymentMethod: data.paymentMethod as any,
        paymentGateway: paymentGateway as any,
        paymentStatus: paidOnCreate ? 'PAID' : 'PENDING',
        subtotal,
        deliveryFee,
        convenientFee,
        discount,
        loyaltyDiscount,
        total,
        prepaidAmount: paidOnCreate ? total : 0,
        promoCode: data.promoCode?.trim() || appliedPromo?.code || undefined,
        qrCode,
        pickupTime: data.pickupTime,
        estimatedMinutes: data.orderMode === 'DELIVERY' ? 35 : 20,
        notes: orderNotes,
        platform: data.platform,
        items: {
          create: [
            ...cartItems.map((i) => ({
              productId: i.productId,
              productName: i.product.name,
              size: i.size as 'REGULAR' | 'LARGE',
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              totalPrice: i.unitPrice * i.quantity,
              toppings: i.toppings.length > 0 ? {
                create: i.toppings.map((t) => ({
                  toppingId: t.toppingId,
                  toppingName: t.topping.name,
                  extraPrice: t.topping.extraPrice,
                })),
              } : undefined,
            })),
            ...(giftProductId
              ? [{
                  productId: giftProductId,
                  productName: `${giftNote?.replace(/^Free\s+/i, '') || 'Gift'} (FREE)`,
                  size: 'REGULAR' as const,
                  quantity: 1,
                  unitPrice: 0,
                  totalPrice: 0,
                }]
              : []),
          ],
        },
        statusEvents: {
          create: { status: initialStatus, note: 'Order placed — received' },
        },
      },
      include: orderCreateInclude,
    });

      if (consumePromoId) {
        const promoRow = await tx.promoCode.findUnique({ where: { id: consumePromoId } });
        if (!promoRow) throw new AppError('Invalid or expired promo code', 400);
        const limits = parsePromoUsageLimits(promoRow.usageLimits);
        const caps = [limits.maxTotal, promoRow.maxUses, limits.stock].filter(
          (value): value is number => value != null,
        );
        const cap = caps.length ? Math.min(...caps) : null;
        const consumed = await tx.promoCode.updateMany({
          where: {
            id: consumePromoId,
            ...(cap != null ? { usedCount: { lt: cap } } : {}),
          },
          data: { usedCount: { increment: 1 } },
        });
        if (consumed.count !== 1) {
          throw new AppError('Promo code usage limit reached', 409);
        }
      }

      if (spinResultId) {
        const redeemed = await tx.spinResult.updateMany({
          where: { id: spinResultId, status: 'CLAIMED' },
          data: {
            status: 'REDEEMED',
            redeemedAt: new Date(),
            orderId: created.id,
            userId: resolvedUserId ?? undefined,
          },
        });
        if (redeemed.count !== 1) {
          throw new AppError('Spin reward already used or invalid', 409);
        }
      }

      if (customerUserId && loyaltyPointsToDeduct > 0) {
        const deducted = await tx.user.updateMany({
          where: { id: customerUserId, loyaltyPoints: { gte: loyaltyPointsToDeduct } },
          data: { loyaltyPoints: { decrement: loyaltyPointsToDeduct } },
        });
        if (deducted.count !== 1) {
          throw new AppError('Not enough loyalty points', 400);
        }
        await tx.loyaltyTransaction.create({
          data: {
            userId: customerUserId,
            orderId: created.id,
            points: -loyaltyPointsToDeduct,
            type: 'REDEEM',
            note: `Order ${orderNumber}`,
          },
        });
      }

      if (resolvedUserId && created.paymentMethod !== 'LOYALTY_POINTS' && !isOnlinePayment) {
        const setting = resolveLoyaltySettings(await fetchLoyaltySettingRow());
        if (total >= setting.minOrderToEarn) {
          const earned = calcLoyaltyPointsEarned(total, setting);
          if (earned > 0) {
            await tx.user.update({
              where: { id: resolvedUserId },
              data: { loyaltyPoints: { increment: earned } },
            });
            await tx.loyaltyTransaction.create({
              data: {
                userId: resolvedUserId,
                orderId: created.id,
                points: earned,
                type: 'EARN',
                note: `Order ${orderNumber}`,
              },
            });
          }
        }
      }

      if (appliedPromo) {
        const cartLines = cartItems.map((i: ResolvedCartLine) => ({
          productId: i.productId,
          productName: i.product.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.unitPrice * i.quantity,
        }));
        const usageData = buildPromotionUsageRecord({
          orderId: created.id,
          storeId: fulfillingStoreId,
          userId: resolvedUserId,
          subtotal,
          deliveryFee,
          orderDiscount: discount,
          giftCostOverride: giftCostForUsage,
          promo: appliedPromo,
          cartItems: cartLines,
          storePaybackEnabled: store.platformDiscountPaybackEnabled,
        });
        await tx.promotionUsage.create({
          data: {
            id: randomUUID(),
            ...usageData,
          } as Prisma.PromotionUsageUncheckedCreateInput,
        });
      }

      return created;
    }).catch(async (err: unknown) => {
      const duplicate = typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';
      if (!duplicate || !idempotencyKey) {
        throw err;
      }
      const existing = await prisma.order.findFirst({
        where: { idempotencyKey },
        include: orderCreateInclude,
      });
      const sameCaller = !!existing && (
        (customerUserId != null && existing.userId === customerUserId)
        || (customerUserId == null
          && guestPhonesMatchForIdempotency(guestPhone, existing.guestPhone))
      );
      if (!existing || !sameCaller) throw err;
      return Object.assign(existing, { __idempotentReplay: true as const });
    });
    } finally {
      if (idempotencyKey) {
        await releaseOrderIdempotencySessionLock(idempotencyKey);
      }
    }

    if ((order as { __idempotentReplay?: boolean }).__idempotentReplay) {
      return success(res, { order }, 200);
    }

    try {
    if (paidOnCreate) {
      await stampCancelWindowStart(order.id);
    }

    if (activeReservationUuid) {
      try {
        await validateAndLinkReservationToOrder({
          reservationUuid: activeReservationUuid,
          orderId: order.id,
          storeId: fulfillingStoreId,
          items: stockLines,
        });
      } catch (stockErr) {
        const isQtyMismatch =
          stockErr instanceof InsufficientStockError &&
          /Reservation quantities changed|Reservation expired|Reservation store mismatch/i.test(
            stockErr.message,
          );

        // Cart changed after the hold was created — rebuild hold and link once.
        if (isQtyMismatch) {
          try {
            const session = await createCheckoutReservation({
              storeId: fulfillingStoreId,
              items: stockLines,
              userId: resolvedUserId,
              reservationUuid: activeReservationUuid,
              renewExisting: false,
            });
            activeReservationUuid = session.reservationUuid;
            await validateAndLinkReservationToOrder({
              reservationUuid: activeReservationUuid,
              orderId: order.id,
              storeId: fulfillingStoreId,
              items: stockLines,
            });
          } catch (retryErr) {
            if (retryErr instanceof InsufficientStockError) {
              throw new AppError(retryErr.message, 409);
            }
            throw retryErr;
          }
        } else if (stockErr instanceof InsufficientStockError) {
          throw new AppError(stockErr.message, 409);
        } else {
          throw stockErr;
        }
      }
    }

    // Deduct weekly stock for non-online orders (online deducts after payment succeeds)
    if (shouldDeductStockOnOrderCreate(data.paymentMethod as any)) {
      const deductLines = cartItems.map((i: any) => ({ productId: i.productId, quantity: i.quantity }));
      if (giftProductId) {
        deductLines.push({ productId: giftProductId, quantity: 1 });
      }
      await deductOrderItemsOnce(fulfillingStoreId, deductLines, order.id);
    }

    if (shouldCreditWalletOnOrderCreate(data.paymentMethod as any)) {
      creditWalletForOrder(
        order.id,
        fulfillingStoreId,
        order.total,
        data.paymentMethod,
      ).catch(() => {});
    }

    let orderResponse = order;
    let takeawayQueuePosition: number | null = null;
    if (data.orderMode === 'TAKEAWAY') {
      const slot = await assignTakeawayQueueSlot(data.storeId, order.id, requestedPickupAt);
      takeawayQueuePosition = slot.queuePosition;
      const etaMins = Math.max(
        1,
        Math.ceil((slot.scheduledPickupAt.getTime() - Date.now()) / 60000)
      );
      const pickupLabel = formatTime(slot.scheduledPickupAt);
      orderResponse =
        (await prisma.order.update({
          where: { id: order.id },
          data: {
            estimatedMinutes: etaMins,
            pickupTime: pickupLabel,
          },
          include: orderCreateInclude,
        })) ?? order;
    } else if (requestedPickupAt) {
      const etaMins = Math.max(
        1,
        Math.ceil((requestedPickupAt.getTime() - Date.now()) / 60000),
      );
      orderResponse =
        (await prisma.order.update({
          where: { id: order.id },
          data: { estimatedMinutes: Math.max(order.estimatedMinutes, etaMins) },
          include: orderCreateInclude,
        })) ?? order;
    }

    // Clear server cart after payment for online orders; immediately for cash/counter.
    if (resolvedUserId && !isOnlinePayment) {
      const cart = await prisma.cart.findUnique({ where: { userId: resolvedUserId } });
      if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }

    // In-app notifications for branch admins (skip unpaid online orders until payment confirms).
    if (!isOnlinePayment) {
      notifyBranchNewOrder({
        orderId: orderResponse.id,
        orderNumber: orderResponse.orderNumber,
        storeId: orderResponse.storeId,
        storeName: orderResponse.store.name,
        orderMode: orderResponse.orderMode,
        total: orderResponse.total,
        guestName: guestName ?? data.guestName,
        userName: authUser?.name,
        phone: guestPhone,
        itemCount: orderResponse.items.length,
        status: orderResponse.status,
        paymentMethod: orderResponse.paymentMethod,
        paymentStatus: orderResponse.paymentStatus,
        channel: orderResponse.channel,
        queuePosition: takeawayQueuePosition ?? orderResponse.queuePosition ?? null,
        pickupTime: orderResponse.pickupTime,
        scheduledPickupAt: orderResponse.scheduledPickupAt?.toISOString() ?? null,
        createdAt: orderResponse.createdAt.toISOString(),
        items: mapNotifyOrderItems(orderResponse.items),
      }).catch(() => {});
    }

    const notifyUser = resolvedUserId
      ? await prisma.user.findUnique({ where: { id: resolvedUserId }, select: { phone: true, email: true } })
      : null;
    const phone = notifyUser?.phone ?? guestPhone;

    // Unpaid online checkout waits for the payment receipt SMS after PayHere/WebXPay.
    if (phone && !isOnlinePayment) {
      sendOrderConfirmationSms(phone, orderNumber, order.estimatedMinutes, total).catch(() => {});
    }

    const email = notifyUser?.email ?? guestEmail;
    if (email && !isOnlinePayment) {
      sendOrderConfirmationEmail(email, orderNumber, [], total).catch(() => {});
    }

    // In-app + push for cash / counter orders (online payment notifies after PayHere succeeds).
    if (resolvedUserId && !isOnlinePayment) {
      notifyCustomerOrderPlaced({
        id: orderResponse.id,
        orderNumber: orderResponse.orderNumber,
        userId: resolvedUserId,
        orderMode: orderResponse.orderMode,
      }).catch(() => {});
    }

    // Online payment (PayHere sandbox / live)
    if (isOnlinePayment) {
      const frontendBase = resolveFrontendUrl(req, data.frontendOrigin);
      const adapter = await getPaymentAdapter(true);
      const payment = await adapter.initiate({
        orderId: order.id,
        orderNumber,
        amount: total,
        customerName: resolveCustomerDisplayName({
          guestName,
          userName: authUser?.name,
          phone: phone || guestPhone,
        }),
        customerPhone: phone || guestPhone || '0770000000',
        customerEmail: email,
        returnUrl: buildPayhereReturnUrl(req, orderNumber, frontendBase),
        cancelUrl: `${frontendBase}/checkout`,
        notifyUrl: payhereNotifyUrl(),
        itemDescription: `Bing Chun Order ${orderNumber}`,
        address: data.deliveryAddress?.addressLine,
        city: data.deliveryAddress?.city,
      });

      const clientOrder = req.user?.type === 'admin'
        ? orderResponse
        : stripStaffAttribution(orderResponse);
      return success(res, {
        order: clientOrder,
        paymentUrl: payment.paymentUrl,
        payhere: payment.payhere,
        reservationUuid: activeReservationUuid ?? undefined,
      }, 201);
    }

    return success(res, {
      order: req.user?.type === 'admin' ? orderResponse : stripStaffAttribution(orderResponse),
    }, 201);
    } catch (postCreateErr) {
      await compensateFailedPlaceOrder(order.id).catch(() => undefined);
      if (
        postCreateErr instanceof InsufficientStockError
        || (postCreateErr instanceof Error && /insufficient stock/i.test(postCreateErr.message))
      ) {
        throw new AppError(
          postCreateErr instanceof Error ? postCreateErr.message : 'Insufficient stock',
          409,
          'INSUFFICIENT_STOCK',
        );
      }
      throw postCreateErr;
    }
  } catch (err) {
    next(err);
  } finally {
    if (idempotencyLockKey) {
      await releaseOrderIdempotencySessionLock(idempotencyLockKey).catch(() => undefined);
    }
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const identifier = req.params.id as string;
    const order = await prisma.order.findFirst({
      where: orderIdentifierWhere(identifier),
      include: orderDetailInclude,
    });
    if (!order) throw new AppError('Order not found', 404);

    const access = resolveOrderAccess({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        trackToken: order.trackToken,
        userId: order.userId,
      },
      identifier,
      trackToken: readTrackToken(req),
      user: req.user,
    });
    if (access.allowed === false) throw new AppError(access.reason, 403);
    if (access.mode === 'admin') {
      await assertOrderStoreAccess(req, order.storeId);
    }

    const normalized = normalizeOrderItemImages(order);
    const withRating = withPlatformRating(normalized);

    let deliveryCode: string | null = null;
    if (
      access.mode !== 'track_token' &&
      order.orderMode === 'DELIVERY' &&
      order.status !== 'DELIVERED' &&
      order.status !== 'CANCELLED' &&
      (access.mode === 'owner' || access.mode === 'admin')
    ) {
      deliveryCode = await getLiveDeliveryCode(order.id).catch(() => null);
    }

    const cancelFlags = await attachCustomerCancelFields({
      orderId: order.id,
      status: order.status,
      createdAt: order.createdAt,
      total: order.total,
      subtotal: order.subtotal,
      discount: order.discount,
      loyaltyDiscount: order.loyaltyDiscount,
      deliveryFee: order.deliveryFee,
      convenientFee: order.convenientFee,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
    });

    const tracking =
      order.orderMode === 'DELIVERY' && order.status !== 'CANCELLED'
        ? await (
            config.deliveryTrackingViaService
              ? fetchDeliveryTrackingFromService(order.id)
              : getLiveTrackingForOrder(order.id)
          ).catch(() => null)
        : null;

    // After delivery, live tracking is cleared — still resolve rider for the rating card.
    let assignedDriver = tracking?.driver ?? null;
    if (order.orderMode === 'DELIVERY' && !assignedDriver) {
      const link = await prisma.deliveryJobOrder.findFirst({
        where: { orderId: order.id, job: { driverId: { not: null } } },
        select: { job: { select: { driverId: true } } },
        orderBy: { sequence: 'asc' },
      });
      if (link?.job.driverId) {
        assignedDriver = await getAssignedDriverPublic(link.job.driverId).catch(() => null);
      }
    }

    const liveTrackingActive =
      order.status !== 'DELIVERED' && order.status !== 'CANCELLED' ? tracking : null;

    const payload = {
      ...withRating,
      ...(deliveryCode ? { deliveryCode } : {}),
      ...(access.mode === 'admin'
        ? { paymentFailureReason: await getOrderPaymentFailureReason(order.id) }
        : {}),
      ...cancelFlags,
      ...(liveTrackingActive?.location
        ? {
            driverLocation: {
              lat: liveTrackingActive.location.lat,
              lng: liveTrackingActive.location.lng,
              heading: liveTrackingActive.location.heading,
              speedKph: liveTrackingActive.location.speedKph,
              recordedAt: liveTrackingActive.location.recordedAt,
            },
          }
        : {}),
      ...(liveTrackingActive?.phase ? { deliveryPhase: liveTrackingActive.phase } : {}),
      ...(liveTrackingActive ? { deliveryPickedUp: liveTrackingActive.pickedUp } : {}),
      ...(liveTrackingActive?.pickedUpAt ? { deliveryPickedUpAt: liveTrackingActive.pickedUpAt } : {}),
      ...(assignedDriver ? { assignedDriver } : {}),
    };

    if (access.mode === 'track_token') {
      return success(res, toPublicOrderView(payload));
    }

    return success(res, req.user?.type === 'admin'
      ? withAdminOrderFlags(payload, await getPickupOrderEditSettings())
      : stripStaffAttribution(payload));
  } catch (err) { next(err); }
}

export async function getMyOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const { page = '1', limit = '10', filter = 'all', sort = 'newest' } = req.query as Record<string, string>;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (p - 1) * l;

    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { phone: true },
    });
    const phoneVariants = user?.phone ? phoneLookupVariants(user.phone) : [];

    // Guest-phone matches must be unclaimed. Otherwise a new account created after
    // deleting the old one would still inherit historical orders that kept guestPhone.
    const where: Prisma.OrderWhereInput =
      phoneVariants.length > 0
        ? {
            OR: [
              { userId: req.user!.sub },
              { userId: null, guestPhone: { in: phoneVariants } },
            ],
          }
        : { userId: req.user!.sub };

    if (filter === 'ongoing') {
      where.status = { notIn: ['DELIVERED', 'CANCELLED'] as OrderStatus[] };
    } else if (filter === 'completed') {
      where.status = { in: ['DELIVERED', 'CANCELLED'] as OrderStatus[] };
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: sort === 'oldest' ? 'asc' : 'desc' },
        skip,
        take: l,
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              productName: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              size: true,
              toppings: { select: { toppingName: true, extraPrice: true } },
              product: { select: { imageUrl: true } },
            },
          },
          store: { select: { id: true, name: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return paginated(res, orders.map(stripStaffAttribution), total, p, l);
  } catch (err) { next(err); }
}

export async function updateOrderContact(req: Request, res: Response, next: NextFunction) {
  try {
    const { guestName, guestPhone } = z.object({
      guestName: z.string().min(1),
      guestPhone: z.string().min(1),
    }).parse(req.body);

    const identifier = req.params.id as string;
    const existing = await prisma.order.findFirst({
      where: { OR: [{ id: identifier }, { orderNumber: identifier }] },
    });
    if (!existing) throw new AppError('Order not found', 404);
    await assertOrderStoreAccess(req, existing.storeId);

    const order = await prisma.order.update({
      where: { id: existing.id },
      data: {
        guestName: guestName.trim(),
        guestPhone: normalizePhone(guestPhone),
      },
      include: {
        items: {
          include: {
            toppings: true,
            product: { select: { imageUrl: true } },
          },
        },
        statusEvents: { orderBy: { createdAt: 'asc' } },
        store: { select: { id: true, name: true, addressLine: true, lat: true, lng: true } },
        address: true,
        user: { select: { name: true, phone: true } },
      },
    });

    return success(res, order);
  } catch (err) { next(err); }
}

export async function updateOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, note, cancelReason } = z.object({
      status: z.enum(['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']),
      note: z.string().optional(),
      cancelReason: z.enum(['OUT_OF_STOCK', 'CUSTOMER_REQUEST', 'PAYMENT_OR_SYSTEM_ISSUE']).optional(),
    }).parse(req.body);

    const existing = await prisma.order.findUnique({
      where: { id: req.params.id as string },
      include: {
        items: { select: { productId: true, quantity: true } },
        user: { select: { name: true, phone: true } },
        refund: { select: { id: true } },
      },
    });
    if (!existing) throw new AppError('Order not found', 404);
    await assertOrderStoreAccess(req, existing.storeId);

    try {
      assertValidStatusTransition(
        { status: existing.status as OrderStatus, orderMode: existing.orderMode as 'DELIVERY' | 'TAKEAWAY' },
        status as OrderStatus
      );
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : 'Invalid status transition', 400);
    }

    const paidOnFulfillment = paymentStatusOnOrderStatus(existing, status);
    const actor = await resolveOrderActor(req);

    let cancelledBy: string | undefined;
    if (status === 'CANCELLED' && req.user?.type === 'admin') {
      cancelledBy = actor?.name ?? req.user?.role ?? 'Staff';
    }

    const order = await prisma.$transaction(async (tx) => {
      // Branch Reject / cancel must set CANCELLED so period wallet math
      // (loyaltyDiscount → periodLoyaltyDiscountTotal, commission) drops this order immediately,
      // even while paymentStatus remains PAID until refund completes.
      const updated = await tx.order.update({
        where: { id: existing.id },
        data: {
          status: status as any,
          ...(paidOnFulfillment
            ? { paymentStatus: paidOnFulfillment, prepaidAmount: existing.total }
            : {}),
          ...(status === 'CANCELLED' && cancelReason ? { cancelReason } : {}),
          ...(status === 'CANCELLED' && cancelledBy ? { cancelledBy } : {}),
          ...(status === 'CANCELLED' ? { cancelledAtStatus: existing.status as OrderStatus } : {}),
          statusEvents: nestedOrderStatusEvent(status, note, actor),
        },
      });
      await claimProcessedBy(tx, existing.id, actor);

      if (
        status === 'CANCELLED'
        && !existing.refund
        && isOnlinePaidOrder(existing.paymentMethod, existing.paymentStatus)
      ) {
        const cancelWindowMinutes = await getCancelWindowMinutes();
        const cancelWindowStartsAt = await getCancelWindowStartsAt(existing.id);
        const cancelEligibility = getCustomerCancelEligibility({
          status: existing.status,
          createdAt: existing.createdAt,
          cancelWindowStartsAt,
          paymentMethod: existing.paymentMethod,
          paymentStatus: existing.paymentStatus,
          cancelWindowMinutes,
        });
        const tier = cancelEligibility.cancelRefundTier ?? 'partial';
        const cancelledWithinWindow = tier === 'full';
        const { cancellationReason, customReasonText } = mapAdminCancelReasonToRefundReason(cancelReason);

        await createRefundForCancelledOrder(tx, {
          order: {
            id: existing.id,
            userId: existing.userId,
            guestName: existing.guestName,
            subtotal: existing.subtotal,
            discount: existing.discount,
            loyaltyDiscount: existing.loyaltyDiscount,
            deliveryFee: existing.deliveryFee,
            convenientFee: existing.convenientFee,
            total: existing.total,
            paymentMethod: existing.paymentMethod,
            paymentStatus: existing.paymentStatus,
            user: existing.user,
          },
          submittedBy: 'BRANCH_ADMIN',
          cancellationReason,
          customReasonText,
          refundTier: tier,
          cancelledWithinWindow,
          orderStatusAtCancel: existing.status as OrderStatus,
        });
      }

      return updated;
    });

    if (paidOnFulfillment === 'PAID') {
      creditWalletForOrder(order.id, order.storeId, order.total, order.paymentMethod).catch(() => {});
      const phone = orderSmsPhone(existing);
      if (phone) {
        sendOrderReceiptSms(phone, order.orderNumber, order.total, order.estimatedMinutes).catch(() => {});
      }
    }

    notifyCustomerOrderStatus({
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status,
      orderMode: order.orderMode,
      note,
    }).catch(() => {});

    notifyMessagingOrderStatus({
      id: order.id,
      orderNumber: order.orderNumber,
      status,
      channel: order.channel,
      userId: order.userId,
    }).catch(() => {});

    void publishOrderStatusChangedEvent({
      orderId: order.id,
      status,
      previousStatus: existing.status,
      orderMode: order.orderMode,
    });
    let cancelEventPublished = false;
    if (status === 'CANCELLED') {
      cancelEventPublished = await publishOrderCancelledEvent({
        orderId: order.id,
        orderMode: order.orderMode,
        cancelledBy: 'admin',
      });
    }

    if (
      existing.orderMode === 'DELIVERY' &&
      (status === 'DELIVERED' || status === 'CANCELLED')
    ) {
      if (status === 'CANCELLED' && !cancelEventPublished) {
        // Delivery-service rings the rider when the event lands. This path is the
        // fallback when the flag is off or Redis did not accept the event.
        await notifyDriverOrderCancelled(order.id, { cancelledBy: 'branch' });
      }
      await maybeAutoCompleteDeliveryJobsForOrder(order.id);
      await syncJobDeliveryEventForOrderStatus(order.id, status);
    }

    // Restore stock when cancelled (only if stock was deducted)
    if (status === 'CANCELLED') {
      if (await orderStockWasDeducted(existing.id)) {
        await restoreOrderItems(existing.storeId, existing.id);
      }
    }

    if (status === 'CANCELLED') {
      await prisma.promotionUsage.updateMany({
        where: {
          orderId: existing.id,
          platformPaybackEligible: true,
          platformPaybackReversedAt: null,
        },
        data: { platformPaybackReversedAt: new Date() },
      });
    }

    return success(res, order);
  } catch (err) { next(err); }
}

export async function cancelOrderByCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const identifier = req.params.id as string;
    const { cancellationReason, customReasonText } = customerCancelSchema.parse(req.body);

    let validatedReason;
    try {
      validatedReason = await validateActiveCancellationReason(cancellationReason);
    } catch {
      throw new AppError('Invalid cancellation reason', 400);
    }
    if (validatedReason.value === OTHER_CANCEL_REASON_VALUE && !customReasonText?.trim()) {
      throw new AppError('Please specify your cancellation reason', 400);
    }
    
    const existing = await prisma.order.findFirst({
      where: orderIdentifierWhere(identifier),
      include: { 
        items: { select: { productId: true, quantity: true } },
        user: { select: { name: true } },
      },
    });
    if (!existing) throw new AppError('Order not found', 404);

    const access = resolveOrderAccess({
      order: {
        id: existing.id,
        orderNumber: existing.orderNumber,
        trackToken: existing.trackToken,
        userId: existing.userId,
      },
      identifier,
      trackToken: readTrackToken(req),
      user: req.user,
    });
    if (access.allowed === false) throw new AppError(access.reason, 403);

    const cancelWindowMinutes = await getCancelWindowMinutes();
    const cancelWindowStartsAt = await getCancelWindowStartsAt(existing.id);
    const cancelEligibility = getCustomerCancelEligibility({
      status: existing.status,
      createdAt: existing.createdAt,
      cancelWindowStartsAt,
      paymentMethod: existing.paymentMethod,
      paymentStatus: existing.paymentStatus,
      cancelWindowMinutes,
    });
    const { canCancel, cancelRefundTier } = cancelEligibility;
    if (!canCancel) {
      throw new AppError('This order can no longer be cancelled', 400);
    }

    try {
      assertValidStatusTransition(
        { status: existing.status as OrderStatus, orderMode: existing.orderMode as 'DELIVERY' | 'TAKEAWAY' },
        'CANCELLED',
      );
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : 'Invalid status transition', 400);
    }

    const tier = cancelRefundTier ?? 'partial';
    const cancelledWithinWindow = tier === 'full';
    const partialRefundPercentage = tier === 'partial'
      ? await getRefundPercentageForStatus(existing.status)
      : null;
    const note = buildCustomerCancelNote(tier, {
      deliveryFee: existing.deliveryFee,
      convenientFee: existing.convenientFee,
      paymentMethod: existing.paymentMethod,
      paymentStatus: existing.paymentStatus,
    }, partialRefundPercentage);

    const orderStatusAtCancel = existing.status as OrderStatus;

    const order = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: existing.id },
        data: {
          status: 'CANCELLED',
          cancelReason: 'CUSTOMER_REQUEST',
          cancelledBy: 'customer',
          cancelledAtStatus: orderStatusAtCancel,
          statusEvents: { create: { status: 'CANCELLED', note } },
        },
        include: orderDetailInclude,
      });

      if (isOnlinePaidOrder(existing.paymentMethod, existing.paymentStatus)) {
        await createRefundForCancelledOrder(tx, {
          order: {
            id: existing.id,
            userId: existing.userId,
            guestName: existing.guestName,
            subtotal: existing.subtotal,
            discount: existing.discount,
            loyaltyDiscount: existing.loyaltyDiscount,
            deliveryFee: existing.deliveryFee,
            convenientFee: existing.convenientFee,
            total: existing.total,
            paymentMethod: existing.paymentMethod,
            paymentStatus: existing.paymentStatus,
            user: existing.user,
          },
          submittedBy: 'CUSTOMER',
          cancellationReason: validatedReason.value,
          customReasonText: validatedReason.value === OTHER_CANCEL_REASON_VALUE ? customReasonText : null,
          refundTier: tier,
          cancelledWithinWindow,
          orderStatusAtCancel,
        });
      }

      return updatedOrder;
    });

    notifyCustomerOrderStatus({
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: 'CANCELLED',
      orderMode: order.orderMode,
      note,
    }).catch(() => {});

    notifyMessagingOrderStatus({
      id: order.id,
      orderNumber: order.orderNumber,
      status: 'CANCELLED',
      channel: order.channel,
      userId: order.userId,
    }).catch(() => {});

    const cancelEventPublished = await publishOrderCancelledEvent({
      orderId: order.id,
      orderMode: order.orderMode,
      cancelledBy: 'customer',
    });

    if (existing.orderMode === 'DELIVERY') {
      if (!cancelEventPublished) {
        await notifyDriverOrderCancelled(order.id, { cancelledBy: 'customer' });
      }
      await maybeAutoCompleteDeliveryJobsForOrder(order.id);
    }

    if (await orderStockWasDeducted(existing.id)) {
      await restoreOrderItems(existing.storeId, existing.id);
    }

    const normalized = normalizeOrderItemImages(order);
    const withRating = withPlatformRating(normalized);
    const cancelFlags = await attachCustomerCancelFields({
      orderId: order.id,
      status: order.status,
      createdAt: order.createdAt,
      total: order.total,
      subtotal: order.subtotal,
      discount: order.discount,
      loyaltyDiscount: order.loyaltyDiscount,
      deliveryFee: order.deliveryFee,
      convenientFee: order.convenientFee,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
    });

    return success(res, {
      ...stripStaffAttribution(withRating),
      ...cancelFlags,
    });
  } catch (err) { next(err); }
}

/** Admin: customer picked up takeaway at counter (scan QR + collect payment) */
export async function completeTakeawayPickup(req: Request, res: Response, next: NextFunction) {
  try {
    const identifier = req.params.id as string;
    const { collectPayment = true, collectBalance, note, paymentMethod, cashReceivedAmount } = z.object({
      collectPayment: z.boolean().optional(),
      collectBalance: z.boolean().optional(),
      note: z.string().optional(),
      paymentMethod: z.enum(['CASH_AT_COUNTER', 'CARD']).optional(),
      cashReceivedAmount: z.number().int().nonnegative().optional(),
    }).parse(req.body ?? {});

    const existing = await prisma.order.findFirst({
      where: { OR: [{ id: identifier }, { orderNumber: identifier }] },
      include: { user: { select: { phone: true } } },
    });
    if (!existing) throw new AppError('Order not found', 404);
    if (existing.orderMode !== 'TAKEAWAY') throw new AppError('This is not a takeaway order', 400);
    if (existing.status === 'CANCELLED') throw new AppError('Order is cancelled', 400);
    if (existing.status === 'DELIVERED') throw new AppError('Order already completed', 400);

    await assertOrderStoreAccess(req, existing.storeId);

    const balanceDue = orderBalanceDue(existing);
    const alreadyPaid = existing.paymentStatus === 'PAID';
    const shouldCollectBalance = collectBalance ?? (alreadyPaid && balanceDue > 0);
    const markPaidAtCounter = !alreadyPaid && collectPayment;
    const resolvedPaymentMethod = paymentMethod ?? existing.paymentMethod;

    const collectingCash =
      resolvedPaymentMethod === 'CASH_AT_COUNTER' &&
      (markPaidAtCounter || shouldCollectBalance);

    let cashTender: { cashReceivedAmount: number; changeGivenAmount: number } | null = null;
    if (collectingCash) {
      const collectedAmount = markPaidAtCounter ? existing.total : balanceDue;
      if (collectedAmount > 0) {
        if (cashReceivedAmount == null) {
          throw new AppError('Cash received amount is required for cash payment', 400);
        }
        if (cashReceivedAmount < collectedAmount) {
          throw new AppError('Cash received is less than amount due', 400);
        }
        cashTender = {
          cashReceivedAmount,
          changeGivenAmount: cashReceivedAmount - collectedAmount,
        };
      }
    }

    let statusNote = note;
    if (!statusNote) {
      if (markPaidAtCounter) {
        statusNote = resolvedPaymentMethod === 'CARD'
          ? 'Picked up & paid at counter (card)'
          : 'Picked up & paid at counter (cash)';
      } else if (shouldCollectBalance) {
        statusNote = resolvedPaymentMethod === 'CARD'
          ? 'Picked up · add-on card payment collected at counter'
          : 'Picked up · add-on cash collected at counter';
      } else if (alreadyPaid) statusNote = 'Picked up at counter';
      else statusNote = 'Picked up at counter';
    }

    const actor = await resolveOrderActor(req);

    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: existing.id },
        data: {
          status: 'DELIVERED',
          paymentStatus: markPaidAtCounter || alreadyPaid ? 'PAID' : existing.paymentStatus,
          prepaidAmount: markPaidAtCounter || shouldCollectBalance ? existing.total : existing.prepaidAmount,
          ...(markPaidAtCounter && paymentMethod ? { paymentMethod: resolvedPaymentMethod } : {}),
          ...(cashTender ?? {}),
          statusEvents: nestedOrderStatusEvent('DELIVERED', statusNote, actor),
        },
      });
      await claimProcessedBy(tx, updated.id, actor);
      return updated;
    });

    notifyCustomerOrderStatus({
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: 'DELIVERED',
      orderMode: order.orderMode,
      note: statusNote,
    }).catch(() => {});

    if (markPaidAtCounter) {
      await stampCancelWindowStart(order.id);
      creditWalletForOrder(order.id, order.storeId, order.total, resolvedPaymentMethod).catch(() => {});
      const phone = orderSmsPhone(existing);
      if (phone) {
        sendOrderReceiptSms(phone, order.orderNumber, order.total, order.estimatedMinutes).catch(() => {});
      }
    }
    if (shouldCollectBalance && balanceDue > 0) {
      const addonMethod = paymentMethod ?? 'CASH_AT_COUNTER';
      creditWalletAddonPayment(order.id, order.storeId, balanceDue, addonMethod).catch(() => {});
    }

    const full = await prisma.order.findUnique({
      where: { id: order.id },
      include: orderDetailInclude,
    });
    if (!full) throw new AppError('Order not found', 404);

    return success(res, withAdminOrderFlags(normalizeOrderItemImages(full), await getPickupOrderEditSettings()));
  } catch (err) { next(err); }
}

/** Admin: mark order payment collected without changing status */
export async function collectOrderPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const identifier = req.params.id as string;
    const existing = await prisma.order.findFirst({
      where: { OR: [{ id: identifier }, { orderNumber: identifier }] },
      include: { user: { select: { phone: true } } },
    });
    if (!existing) throw new AppError('Order not found', 404);
    if (existing.paymentStatus === 'PAID') throw new AppError('Order is already paid', 400);
    if (existing.status === 'CANCELLED') throw new AppError('Order is cancelled', 400);

    await assertOrderStoreAccess(req, existing.storeId);

    const actor = await resolveOrderActor(req);
    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: existing.id },
        data: {
          paymentStatus: 'PAID',
          prepaidAmount: existing.total,
          statusEvents: nestedOrderStatusEvent(existing.status, 'Payment collected at counter', actor),
        },
      });
      await claimProcessedBy(tx, updated.id, actor);
      return updated;
    });
    await stampCancelWindowStart(order.id);

    // Credit store wallet
    creditWalletForOrder(order.id, order.storeId, order.total, order.paymentMethod).catch(() => {});

    const phone = orderSmsPhone(existing);
    if (phone) {
      sendOrderReceiptSms(phone, order.orderNumber, order.total, order.estimatedMinutes).catch(() => {});
    }

    return success(res, order);
  } catch (err) { next(err); }
}

/** Admin: edit items on pickup orders (full edit or add-only on paid orders) */
export async function updateOrderItems(req: Request, res: Response, next: NextFunction) {
  try {
    const { items } = updateOrderItemsSchema.parse(req.body);
    const identifier = req.params.id as string;

    const existing = await prisma.order.findFirst({
      where: { OR: [{ id: identifier }, { orderNumber: identifier }] },
      include: { items: { include: { toppings: true } } },
    });
    if (!existing) throw new AppError('Order not found', 404);

    await assertOrderStoreAccess(req, existing.storeId);

    const lockedCharge = await readOnlineChargeAmount(existing.id);
    if (
      isOnlinePaymentMethod(existing.paymentMethod)
      && existing.paymentStatus !== 'PAID'
      && lockedCharge != null
    ) {
      throw new AppError(
        'This order is waiting for online payment and its total can no longer be changed',
        409,
      );
    }

    const actor = await resolveOrderActor(req);
    const pickupSettings = await getPickupOrderEditSettings();
    const fullEdit = canAdminEditOrder(existing, pickupSettings);
    const addOnly = canAdminAddOrderItems(existing, pickupSettings);

    if (!fullEdit && !addOnly) {
      throw new AppError(adminEditOrderDeniedMessage(existing, pickupSettings), 403);
    }

    const existingItemMap = new Map(existing.items.map((i) => [i.id, i]));
    const keptExistingIds = new Set<string>();
    const newItemPayloads: z.infer<typeof placeOrderItemSchema>[] = [];

    for (const item of items) {
      if ('orderItemId' in item) {
        if (!existingItemMap.has(item.orderItemId)) {
          throw new AppError(`Order item not found: ${item.orderItemId}`, 400);
        }
        if (keptExistingIds.has(item.orderItemId)) {
          throw new AppError('Duplicate order item in request', 400);
        }
        keptExistingIds.add(item.orderItemId);
      } else {
        newItemPayloads.push(item);
      }
    }

    if (addOnly && !fullEdit) {
      for (const row of existing.items) {
        if (!keptExistingIds.has(row.id)) {
          throw new AppError('Cannot remove items from a paid order', 400);
        }
      }
      for (const item of items) {
        if ('orderItemId' in item) {
          const row = existingItemMap.get(item.orderItemId)!;
          if (item.quantity < row.quantity) {
            throw new AppError('Cannot decrease quantity on a paid order', 400);
          }
        }
      }
    }

    const removeIds = fullEdit
      ? existing.items.filter((i) => !keptExistingIds.has(i.id)).map((i) => i.id)
      : [];

    const newLines =
      newItemPayloads.length > 0
        ? await resolveCartLines(undefined, newItemPayloads)
        : [];

    const previousTotal = existing.total;
    const createdDeductions: Array<{ productId: string; quantity: number; orderItemId: string }> = [];

    await prisma.$transaction(async (tx) => {
      if (newLines.length > 0) {
        await validateStockAvailabilityInTx(
          tx,
          existing.storeId,
          newLines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            productName: line.product.name,
          })),
          'POS',
        );
      }

      for (const item of items) {
        if (!('orderItemId' in item)) continue;
        const row = existingItemMap.get(item.orderItemId)!;
        await tx.orderItem.update({
          where: { id: item.orderItemId },
          data: {
            quantity: item.quantity,
            totalPrice: row.unitPrice * item.quantity,
          },
        });
      }

      if (removeIds.length > 0) {
        await tx.orderItem.deleteMany({ where: { id: { in: removeIds } } });
      }

      for (const line of newLines) {
        const created = await tx.orderItem.create({
          data: {
            orderId: existing.id,
            productId: line.productId,
            productName: line.product.name,
            size: line.size as 'REGULAR' | 'LARGE',
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalPrice: line.unitPrice * line.quantity,
            toppings: line.toppings.length > 0
              ? {
                  create: line.toppings.map((t) => ({
                    toppingId: t.toppingId,
                    toppingName: t.topping.name,
                    extraPrice: t.topping.extraPrice,
                  })),
                }
              : undefined,
          },
        });
        createdDeductions.push({
          productId: line.productId,
          quantity: line.quantity,
          orderItemId: created.id,
        });
      }

      const allItems = await tx.orderItem.findMany({ where: { orderId: existing.id } });
      if (allItems.length === 0) {
        throw new AppError('Order must contain at least one item', 400);
      }

      const subtotal = allItems.reduce((sum, i) => sum + i.totalPrice, 0);
      let convenientFee: number;
      if (
        shouldFreezeConvenienceFeeOnItemEdit(
          existing,
          { fullEdit, addOnly },
          subtotal,
          newItemPayloads.length > 0,
        )
      ) {
        // Counter add-ons must not attract a new convenience fee.
        convenientFee = existing.convenientFee;
      } else if (existing.orderMode === 'TAKEAWAY') {
        convenientFee = 0;
      } else {
        const feeRates = await getConvenienceFeeRates();
        convenientFee = appliesConvenienceFee(
          existing.orderMode,
          existing.paymentMethod as import('@prisma/client').PaymentMethod,
        )
          ? computeConvenientFee(
              subtotal,
              convenienceFeeRateForOrder(existing.orderMode, feeRates),
            )
          : 0;
      }
      const total = Math.max(
        0,
        subtotal + existing.deliveryFee + convenientFee - existing.discount - existing.loyaltyDiscount,
      );

      await tx.order.update({
        where: { id: existing.id },
        data: { subtotal, convenientFee, total },
      });

      const delta = total - previousTotal;
      const eventNote = addOnly && !fullEdit
        ? delta > 0
          ? `Items added by admin (+LKR ${delta})`
          : 'Items updated by admin'
        : 'Items updated by admin';

      await tx.orderStatusEvent.create({
        data: {
          orderId: existing.id,
          ...orderStatusEventData(existing.status, eventNote, actor),
        },
      });

      for (const deduction of createdDeductions) {
        await consumeFifo(
          tx,
          existing.storeId,
          deduction.productId,
          deduction.quantity,
          existing.id,
          deduction.orderItemId,
        );
      }
    });

    if (createdDeductions.length > 0) {
      const productIds = [...new Set(createdDeductions.map((d) => d.productId))];
      for (const productId of productIds) {
        const row = await prisma.storeProduct.findUnique({
          where: { storeId_productId: { storeId: existing.storeId, productId } },
          select: { stock: true, lowStockThreshold: true, onlineOutOfStockThreshold: true },
        });
        if (row) {
          await checkAndEmitThresholds(
            existing.storeId,
            productId,
            row.stock,
            getEffectiveThresholds(row),
          );
        }
      }
    }

    const updated = await prisma.order.findUnique({
      where: { id: existing.id },
      include: orderDetailInclude,
    });
    if (!updated) throw new AppError('Order not found', 404);

    return success(res, withAdminOrderFlags(normalizeOrderItemImages(updated), await getPickupOrderEditSettings()));
  } catch (err) {
    next(err);
  }
}

export async function listTakeawayQueue(req: Request, res: Response, next: NextFunction) {
  try {
    let storeId = req.query.storeId as string | undefined;
    if (isBranchScopedRole(req.user?.role)) {
      storeId = await requireBranchStoreId(req);
    }
    const queue = await getTakeawayQueue(storeId);
    return success(res, queue);
  } catch (err) { next(err); }
}

export async function reorderTakeawayQueueHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderIds, storeId: bodyStoreId } = z.object({
      orderIds: z.array(z.string()).min(1),
      storeId: z.string().optional(),
    }).parse(req.body);

    let storeId = bodyStoreId;
    if (isBranchScopedRole(req.user?.role)) {
      storeId = await requireBranchStoreId(req);
    }
    if (!storeId) {
      const first = await prisma.order.findUnique({
        where: { id: orderIds[0] },
        select: { storeId: true },
      });
      storeId = first?.storeId;
    }
    if (!storeId) throw new AppError('storeId is required', 400);

    await assertOrderStoreAccess(req, storeId);
    await reorderTakeawayQueue(storeId, orderIds);

    const queue = await getTakeawayQueue(storeId);

    try {
      const { getIo } = await import('../lib/socket');
      const io = getIo();
      for (const o of queue) {
        io.to(`order:${o.id}`).emit('queueUpdate', {
          orderId: o.id,
          orderNumber: o.orderNumber,
          queuePosition: o.queuePosition,
          scheduledPickupAt: o.scheduledPickupAt?.toISOString(),
        });
        io.to(`order:${o.orderNumber}`).emit('queueUpdate', {
          orderId: o.id,
          orderNumber: o.orderNumber,
          queuePosition: o.queuePosition,
          scheduledPickupAt: o.scheduledPickupAt?.toISOString(),
        });
      }
      io.to(`store:${storeId}`).emit('takeawayQueueUpdated', { storeId });
    } catch {
      /* socket optional */
    }

    return success(res, queue);
  } catch (err) { next(err); }
}

function parseDayRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  const range: { gte?: Date; lte?: Date } = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) {
      start.setHours(0, 0, 0, 0);
      range.gte = start;
    }
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
  }
  return range.gte || range.lte ? range : undefined;
}

function isCashCollectionNote(note: string | null | undefined): boolean {
  if (!note) return false;
  const lowered = note.toLowerCase();
  return (
    lowered.includes('paid at counter (cash)')
    || lowered.includes('payment collected at counter')
    || lowered.includes('add-on cash collected')
  );
}

export async function getCashierActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const storeIdQuery = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : '';
    const range = parseDayRange(from, to);

    let storeId: string | undefined;
    if (isBranchScopedRole(req.user?.role)) {
      storeId = await requireBranchStoreId(req);
    } else if (storeIdQuery) {
      storeId = storeIdQuery;
    }

    const processedWhere: Prisma.OrderWhereInput = {
      processedByAdminId: { not: null },
      ...(storeId ? { storeId } : {}),
      ...(range ? { processedAt: range } : {}),
    };

    const [processed, events] = await Promise.all([
      prisma.order.groupBy({
        by: ['processedByAdminId', 'processedByName'],
        where: processedWhere,
        _count: { _all: true },
      }),
      prisma.orderStatusEvent.findMany({
        where: {
          actorAdminId: { not: null },
          ...(range ? { createdAt: range } : {}),
          ...(storeId ? { order: { storeId } } : {}),
        },
        select: {
          actorAdminId: true,
          actorName: true,
          status: true,
          note: true,
          order: { select: { total: true, paymentMethod: true } },
        },
      }),
    ]);

    type Row = {
      adminId: string;
      name: string;
      ordersProcessed: number;
      cashCollectedAmount: number;
      cancels: number;
    };
    const byId = new Map<string, Row>();

    function rowFor(adminId: string, name: string | null): Row {
      const existing = byId.get(adminId);
      if (existing) {
        if (name && !existing.name) existing.name = name;
        return existing;
      }
      const created: Row = {
        adminId,
        name: name ?? 'Staff',
        ordersProcessed: 0,
        cashCollectedAmount: 0,
        cancels: 0,
      };
      byId.set(adminId, created);
      return created;
    }

    for (const group of processed) {
      if (!group.processedByAdminId) continue;
      const row = rowFor(group.processedByAdminId, group.processedByName);
      row.ordersProcessed += group._count._all;
    }

    for (const event of events) {
      if (!event.actorAdminId) continue;
      const row = rowFor(event.actorAdminId, event.actorName);
      if (event.status === 'CANCELLED') row.cancels += 1;
      if (isCashCollectionNote(event.note)) {
        row.cashCollectedAmount += event.order.total;
      }
    }

    const cashiers = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    return success(res, { from: from ?? null, to: to ?? null, storeId: storeId ?? null, cashiers });
  } catch (err) { next(err); }
}

export async function getAllOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      page = '1',
      limit = '20',
      status,
      excludeStatus,
      storeId,
      search,
      searchBy,
      orderMode,
      sortDir,
      sortBy,
      startDate,
      endDate,
      hideUnassignedReady,
      paymentStatus,
      fulfillmentQueue,
      channel,
      processedById,
    } = req.query as Record<string, string>;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (p - 1) * l;

    const where: any = {};
    if (status) {
      where.status = status;
    } else if (excludeStatus) {
      const excluded = excludeStatus.split(',').map((s) => s.trim()).filter(Boolean);
      if (excluded.length === 1) {
        where.status = { not: excluded[0] };
      } else if (excluded.length > 1) {
        where.status = { notIn: excluded };
      }
    }
    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }
    if (
      channel === 'WEB' ||
      channel === 'APP' ||
      channel === 'POS' ||
      channel === 'WHATSAPP' ||
      channel === 'TELEGRAM'
    ) {
      where.channel = channel;
    }
    if (processedById?.trim()) {
      where.processedByAdminId = processedById.trim();
    }
    if (orderMode === 'DELIVERY' || orderMode === 'TAKEAWAY') where.orderMode = orderMode;
    if (isBranchScopedRole(req.user?.role)) {
      where.storeId = await requireBranchStoreId(req);
    } else if (storeId) {
      where.storeId = storeId;
    }
    if (search) {
      if (searchBy === 'token') {
        const token = parseInt(search, 10);
        where.queuePosition = Number.isNaN(token) ? -1 : token;
      } else {
        where.OR = [
          { orderNumber: { contains: search } },
          { id: search },
        ];
      }
    }

    const createdAtFilter = createdAtRangeFromDateStrings(startDate, endDate);
    if (createdAtFilter) {
      where.createdAt = createdAtFilter;
    }

    if (hideUnassignedReady === 'true') {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { status: { not: 'READY' } },
            {
              deliveryJobOrders: {
                some: { job: { status: { in: ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS'] } } },
              },
            },
          ],
        },
      ];
    }

    if (fulfillmentQueue === 'pickup' || fulfillmentQueue === 'delivery') {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        fulfillmentQueuePaymentWhere(fulfillmentQueue as FulfillmentQueueKind),
      ];
    }

    const createdAtOrder = sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.OrderOrderByWithRelationInput = { createdAt: createdAtOrder };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy,
        skip,
        take: l,
        select: {
          ...ORDER_LIST_SCALARS,
          items: {
            select: {
              productName: true,
              quantity: true,
              product: { select: { imageUrl: true } },
            },
          },
          store: { select: { name: true } },
          user: { select: { name: true, phone: true } },
          statusEvents: {
            where: { status: 'CANCELLED' },
            select: { status: true, note: true, createdAt: true, actorName: true, actorRole: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          address: {
            select: {
              addressLine: true,
              city: true,
              district: true,
              lat: true,
              lng: true,
            },
          },
          deliveryJobOrders: {
            where: {
              job: { status: { in: ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS'] } },
            },
            take: 1,
            include: {
              job: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  driver: { select: { id: true, name: true } },
                },
              },
            },
          },
          refund: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    const cancelWindowMinutes = await getCancelWindowMinutes();
    const statusRefundMap = await getOrderStatusRefundPercentageMap();
    const cancelWindowStartsAtMap = await getCancelWindowStartsAtMap(orders.map((order) => order.id));
    const mappedOrders = orders.map((order) => ({
      ...normalizeOrderItemImages(order),
      ...withCustomerCancelRefundFields(
        {
          status: order.status,
          createdAt: order.createdAt,
          cancelWindowStartsAt: cancelWindowStartsAtMap.get(order.id) ?? null,
          total: order.total,
          subtotal: order.subtotal,
          discount: order.discount,
          loyaltyDiscount: order.loyaltyDiscount,
          deliveryFee: order.deliveryFee,
          convenientFee: order.convenientFee,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
        },
        cancelWindowMinutes,
        statusRefundMap.get(order.status as OrderStatus) ?? null,
      ),
    }));

    return paginated(
      res,
      mappedOrders,
      total,
      p,
      l,
    );
  } catch (err) { next(err); }
}

export async function paymentNotify(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      merchant_id,
      order_id,
      payment_id,
      payhere_amount,
      payhere_currency,
      status_code,
      md5sig,
      status_message,
    } = payhereNotifyBodySchema.parse(req.body ?? {});

    const result = await processPayHerePaymentNotification({
      merchant_id: merchant_id != null ? String(merchant_id) : undefined,
      order_id: order_id != null ? String(order_id) : undefined,
      payment_id: payment_id != null ? String(payment_id) : undefined,
      payhere_amount: payhere_amount != null ? String(payhere_amount) : undefined,
      payhere_currency,
      status_code: status_code != null ? String(status_code) : undefined,
      md5sig,
      status_message,
    });

    if (result === 'INVALID') throw new AppError('Invalid payment signature', 400);

    return res.status(200).send('OK');
  } catch (err) { next(err); }
}

const payhereReturnSchema = z.object({
  merchant_id: z.string().optional(),
  order_id: z.string().optional(),
  payment_id: z.string().optional(),
  payhere_amount: z.union([z.string(), z.number()]).optional(),
  payhere_currency: z.string().optional(),
  status_code: z.union([z.string(), z.number()]).optional(),
  md5sig: z.string().optional(),
  status_message: z.string().optional(),
});

/** PayHere popup completed — confirm payment only when webhook has marked the order paid. */
export async function confirmPayherePopup(req: Request, res: Response, next: NextFunction) {
  try {
    const identifier = req.params.id as string;
    const order = await prisma.order.findFirst({
      where: orderIdentifierWhere(identifier),
      select: {
        id: true,
        orderNumber: true,
        trackToken: true,
        userId: true,
        paymentMethod: true,
      },
    });
    if (!order) throw new AppError('Order not found', 404);
    const access = resolveOrderAccess({
      order,
      identifier,
      trackToken: readTrackToken(req),
      user: req.user,
    });
    if (access.allowed === false) throw new AppError(access.reason, 403);
    if (!isOnlinePaymentMethod(order.paymentMethod)) {
      throw new AppError('This order does not use online payment', 400);
    }

    const result = await confirmPayherePopupPayment(order.orderNumber);
    if (result === 'NOT_FOUND') throw new AppError('Order not found', 404);
    if (result === 'FAILED') throw new AppError('Payment could not be confirmed', 400);

    const updated = await prisma.order.findFirst({
      where: { orderNumber: order.orderNumber },
      select: {
        id: true,
        orderNumber: true,
        paymentMethod: true,
        paymentStatus: true,
        paymentRef: true,
        prepaidAmount: true,
        total: true,
      },
    });

    if (result === 'PENDING') {
      return success(res, { ...updated, confirmation: 'PENDING' });
    }

    return success(res, updated);
  } catch (err) {
    next(err);
  }
}

/** Customer return from PayHere — verify signed return params or return current status. */
export async function confirmPaymentReturn(req: Request, res: Response, next: NextFunction) {
  try {
    const identifier = req.params.id as string;
    const payload = payhereReturnSchema.parse(req.body ?? {});

    const order = await prisma.order.findFirst({
      where: orderIdentifierWhere(identifier),
      select: {
        id: true,
        orderNumber: true,
        trackToken: true,
        userId: true,
        paymentMethod: true,
        paymentStatus: true,
        paymentRef: true,
        prepaidAmount: true,
        total: true,
      },
    });
    if (!order) throw new AppError('Order not found', 404);

    const access = resolveOrderAccess({
      order,
      identifier,
      trackToken: readTrackToken(req),
      user: req.user,
    });
    if (access.allowed === false) throw new AppError(access.reason, 403);

    if (!isOnlinePaymentMethod(order.paymentMethod)) {
      throw new AppError('This order does not use online payment', 400);
    }

    if (order.paymentStatus !== 'PAID' && payload.md5sig != null && payload.status_code != null) {
      const result = await processPayHerePaymentNotification({
        ...payload,
        order_id: payload.order_id ?? order.orderNumber,
      });
      if (result === 'INVALID') throw new AppError('Invalid payment signature', 400);
    }

    const updated = await prisma.order.findFirst({
      where: { id: order.id },
      select: {
        id: true,
        orderNumber: true,
        paymentMethod: true,
        paymentStatus: true,
        paymentRef: true,
        prepaidAmount: true,
        total: true,
      },
    });

    return success(res, {
      ...(updated ?? order),
      paymentFailureReason: await getOrderPaymentFailureReason(order.id),
    });
  } catch (err) { next(err); }
}

const submitPlatformRatingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export async function submitPlatformRating(req: Request, res: Response, next: NextFunction) {
  try {
    const identifier = req.params.id as string;
    const { stars, comment } = submitPlatformRatingSchema.parse(req.body);

    const order = await prisma.order.findFirst({
      where: orderIdentifierWhere(identifier),
      select: {
        id: true,
        orderNumber: true,
        trackToken: true,
        userId: true,
        orderMode: true,
        status: true,
        platformRating: { select: { id: true } },
      },
    });
    if (!order) throw new AppError('Order not found', 404);

    const access = resolveOrderAccess({
      order,
      identifier,
      trackToken: readTrackToken(req),
      user: req.user,
    });
    if (access.allowed === false) throw new AppError(access.reason, 403);

    const isCompleted =
      order.orderMode === 'DELIVERY'
        ? order.status === 'DELIVERED'
        : order.status === 'READY' || order.status === 'DELIVERED';

    if (!isCompleted) {
      throw new AppError('Rating is only available after your order is complete', 400);
    }

    if (order.platformRating) {
      throw new AppError('You have already rated this order', 409);
    }

    const rating = await prisma.platformRating.create({
      data: {
        orderId: order.id,
        userId: req.user?.type !== 'admin' ? req.user?.sub ?? order.userId ?? null : order.userId ?? null,
        stars,
        comment: comment?.trim() ? comment.trim() : null,
      },
      select: { stars: true, comment: true, createdAt: true },
    });

    return success(res, {
      stars: rating.stars,
      comment: rating.comment,
      createdAt: rating.createdAt.toISOString(),
    }, 201);
  } catch (err) { next(err); }
}

const submitRiderRatingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export async function submitRiderRating(req: Request, res: Response, next: NextFunction) {
  try {
    const identifier = req.params.id as string;
    const { stars, comment } = submitRiderRatingSchema.parse(req.body);

    const order = await prisma.order.findFirst({
      where: orderIdentifierWhere(identifier),
      select: {
        id: true,
        orderNumber: true,
        trackToken: true,
        userId: true,
        orderMode: true,
        status: true,
        riderRating: { select: { id: true } },
        deliveryJobOrders: {
          where: { job: { driverId: { not: null } } },
          select: {
            job: { select: { driverId: true, status: true } },
          },
          orderBy: { sequence: 'asc' },
          take: 1,
        },
      },
    });
    if (!order) throw new AppError('Order not found', 404);

    const access = resolveOrderAccess({
      order,
      identifier,
      trackToken: readTrackToken(req),
      user: req.user,
    });
    if (access.allowed === false) throw new AppError(access.reason, 403);

    if (order.orderMode !== 'DELIVERY') {
      throw new AppError('Rider rating is only available for delivery orders', 400);
    }

    if (order.status !== 'DELIVERED') {
      throw new AppError('Rider rating is only available after delivery is complete', 400);
    }

    if (order.riderRating) {
      throw new AppError('You have already rated this rider', 409);
    }

    const driverId = order.deliveryJobOrders[0]?.job.driverId;
    if (!driverId) {
      throw new AppError('No rider is linked to this delivery', 400);
    }

    const rating = await prisma.riderRating.create({
      data: {
        orderId: order.id,
        driverId,
        userId: req.user?.type !== 'admin' ? req.user?.sub ?? order.userId ?? null : order.userId ?? null,
        stars,
        comment: comment?.trim() ? comment.trim() : null,
      },
      select: { stars: true, comment: true, createdAt: true },
    });

    incrementJobRiderRating(order.id, stars).catch(() => {});

    return success(res, {
      stars: rating.stars,
      comment: rating.comment,
      createdAt: rating.createdAt.toISOString(),
    }, 201);
  } catch (err) { next(err); }
}
