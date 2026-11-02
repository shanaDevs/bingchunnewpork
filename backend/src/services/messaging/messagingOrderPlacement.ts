import type { PaymentMethod } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { generateOrderNumber } from '../../utils/orderNumber';
import { normalizePhone, phoneLookupVariants } from '../../utils/phone';
import { mapsAdapter } from '../../integrations/mapsAdapter';
import { resolveDeliveryValidation, DELIVERY_MIN_ORDER } from '../../lib/deliveryFee';
import {
  branchManuallyClosedMessage,
  isBranchManuallyClosed,
  isCustomerOnlineOrderingOpen,
  customerOnlineOrderingClosedMessage,
} from '../../lib/storeOrderingHours';
import { fetchStoreOrderingHours } from '../../lib/storeOrderingSchema';
import { batchResolveLinePricing } from '../../lib/pricing';
import { validateOrderStock, deductOrderItemsOnce } from '../../lib/stockEngine';
import { InsufficientStockError } from '../inventoryReservationService';
import { mapNotifyOrderItems, notifyBranchNewOrder } from '../../lib/branchNotifications';
import { INITIAL_ORDER_STATUS } from '../../lib/orderStatus';
import { shouldCreditWalletOnOrderCreate } from '../../lib/orderPayment';
import { creditWalletForOrder } from '../../controllers/walletController';
import { logger } from '../../utils/logger';
import type { ConversationCartItem, MessagingChannelKind } from './types';
import { toOrderChannel } from './types';
import { findOrCreateUserByPhone, linkCustomerChannel } from './customerChannelService';

export type MessagingCheckoutInput = {
  channel: MessagingChannelKind;
  externalUserId: string;
  username?: string | null;
  storeId: string;
  cart: ConversationCartItem[];
  guestName: string;
  guestPhone: string;
  addressLine: string;
  city: string;
  district?: string;
  notes?: string;
  orderMode?: 'DELIVERY' | 'TAKEAWAY';
  paymentMethod?: 'CASH_ON_DELIVERY' | 'CASH_AT_COUNTER';
  lat?: number;
  lng?: number;
};

export type MessagingCheckoutResult = {
  orderId: string;
  orderNumber: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  storeName: string;
  guestName: string;
  guestPhone: string;
  addressLine: string;
  city: string;
  orderMode: 'DELIVERY' | 'TAKEAWAY';
  paymentMethod: string;
  items: Array<{ productName: string; quantity: number; unitPrice: number; lineTotal: number }>;
};

function formatMoney(centsOrLkr: number): string {
  // Prices in this codebase are stored as integer LKR (not cents).
  return `Rs. ${centsOrLkr.toLocaleString('en-LK')}`;
}

export function formatCartSummary(
  cart: ConversationCartItem[],
  deliveryFee = 0,
): { text: string; subtotal: number; total: number } {
  const subtotal = cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const lines = cart.map(
    (i) => `${i.productName} × ${i.quantity}\nRs. ${(i.unitPrice * i.quantity).toLocaleString('en-LK')}`,
  );
  const total = subtotal + deliveryFee;
  const text = [
    '🛒 Your Cart',
    '',
    ...lines,
    '----------------',
    `Subtotal: ${formatMoney(subtotal)}`,
    `Delivery: ${formatMoney(deliveryFee)}`,
    '',
    `Total: ${formatMoney(total)}`,
  ].join('\n');
  return { text, subtotal, total };
}

/**
 * Place a messaging-channel order through the same Order / inventory / notification stack
 * used by website and POS. Does not create a parallel order table.
 */
export async function placeMessagingOrder(
  input: MessagingCheckoutInput,
): Promise<MessagingCheckoutResult> {
  if (!input.cart.length) throw new AppError('Cart is empty', 400);

  const orderMode = input.orderMode ?? 'DELIVERY';
  const paymentMethod =
    input.paymentMethod ??
    (orderMode === 'TAKEAWAY' ? 'CASH_AT_COUNTER' : 'CASH_ON_DELIVERY');

  const store = await prisma.store.findFirst({
    where: { id: input.storeId, isActive: true },
  });
  if (!store) throw new AppError('This store is currently unavailable. Please select another store.', 400);

  const orderingRow = await fetchStoreOrderingHours(store.id);
  const storeWithHours = orderingRow ? { ...store, ...orderingRow } : store;
  if (isBranchManuallyClosed(storeWithHours)) {
    throw new AppError(branchManuallyClosedMessage(), 400);
  }
  if (!isCustomerOnlineOrderingOpen(storeWithHours)) {
    throw new AppError(customerOnlineOrderingClosedMessage(storeWithHours), 400);
  }

  const guestName = input.guestName.trim();
  const guestPhone = normalizePhone(input.guestPhone);
  if (!guestName || !guestPhone) {
    throw new AppError('Customer name and phone are required', 400);
  }

  // Re-price from DB (never trust session unit prices for final totals).
  const pricing = await batchResolveLinePricing(
    input.cart.map((line) => ({
      productId: line.productId,
      size: line.size ?? 'REGULAR',
      toppingIds: [],
    })),
  );

  const pricedLines = input.cart.map((line) => {
    const key = `${line.productId}:${line.size ?? 'REGULAR'}:`;
    const priced = pricing.get(key);
    if (!priced) throw new AppError(`Product unavailable: ${line.productName}`, 400);
    return {
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: priced.unitPrice,
      size: line.size ?? ('REGULAR' as const),
    };
  });

  const stockLines = pricedLines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
  try {
    await validateOrderStock(input.storeId, stockLines);
  } catch (err) {
    if (err instanceof InsufficientStockError || (err instanceof Error && /stock|available/i.test(err.message))) {
      throw new AppError(err.message, 409);
    }
    throw err;
  }

  let deliveryZoneId: string | null = null;
  let deliveryFee = 0;
  let lat = input.lat;
  let lng = input.lng;
  const addressLine = input.addressLine.trim();
  const city = input.city.trim();
  const district = (input.district || city).trim();

  if (orderMode === 'DELIVERY') {
    if (!addressLine || !city) {
      throw new AppError('Delivery address and city are required', 400);
    }
    if (lat == null || lng == null) {
      const coords = await mapsAdapter.geocode(`${addressLine}, ${city}, Sri Lanka`);
      if (!coords) {
        // Fall back to store coordinates so order can still enter the system;
        // admin can correct address / zone if needed.
        lat = store.lat;
        lng = store.lng;
        logger.warn('messaging.geocode_fallback_store', {
          storeId: store.id,
          addressLine,
          city,
        });
      } else {
        lat = coords.lat;
        lng = coords.lng;
      }
    }

    const deliveryCheck = await resolveDeliveryValidation(lat!, lng!, store.id);
    if (!deliveryCheck.eligible || !deliveryCheck.store || !deliveryCheck.zone) {
      throw new AppError(
        deliveryCheck.message || 'This address is outside our delivery area for the selected store.',
        400,
      );
    }
    // Distance-based zones use a virtual id — same as website placeOrder.
    deliveryZoneId = null;
    deliveryFee = deliveryCheck.zone.fee;
  }

  const subtotal = pricedLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  if (orderMode === 'DELIVERY' && subtotal < DELIVERY_MIN_ORDER) {
    throw new AppError(`Minimum order for delivery is Rs. ${DELIVERY_MIN_ORDER.toLocaleString('en-LK')}`, 400);
  }

  const total = subtotal + deliveryFee;
  const user = await findOrCreateUserByPhone({ phone: guestPhone, name: guestName });
  await linkCustomerChannel({
    channel: input.channel,
    externalUserId: input.externalUserId,
    customerId: user.id,
    phoneNumber: guestPhone,
    username: input.username,
  });

  // Final stock check + create + deduct inside sequential critical path
  try {
    await validateOrderStock(input.storeId, stockLines);
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : 'Insufficient stock', 409);
  }

  const orderNumber = generateOrderNumber();
  const channel = toOrderChannel(input.channel);
  const initialStatus = INITIAL_ORDER_STATUS;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        userId: user.id,
        guestName,
        guestPhone,
        storeId: store.id,
        deliveryZoneId,
        orderMode,
        status: initialStatus,
        paymentMethod,
        paymentStatus: 'PENDING',
        subtotal,
        deliveryFee,
        convenientFee: 0,
        discount: 0,
        loyaltyDiscount: 0,
        total,
        prepaidAmount: 0,
        estimatedMinutes: orderMode === 'DELIVERY' ? 35 : 20,
        notes: input.notes?.trim() || undefined,
        deliveryAddressLine: orderMode === 'DELIVERY' ? addressLine : undefined,
        deliveryCity: orderMode === 'DELIVERY' ? city : undefined,
        deliveryDistrict: orderMode === 'DELIVERY' ? district : undefined,
        deliveryLat: orderMode === 'DELIVERY' ? lat : undefined,
        deliveryLng: orderMode === 'DELIVERY' ? lng : undefined,
        platform: 0,
        channel,
        items: {
          create: pricedLines.map((l) => ({
            productId: l.productId,
            productName: l.productName,
            size: l.size,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            totalPrice: l.unitPrice * l.quantity,
          })),
        },
        statusEvents: {
          create: { status: initialStatus, note: `Order placed via ${channel}` },
        },
      },
      include: {
        items: true,
        store: { select: { name: true } },
      },
    });

    return created;
  });

  try {
    await deductOrderItemsOnce(
      store.id,
      stockLines,
      order.id,
    );
  } catch (err) {
    // Roll back order if stock deduction fails — never leave an oversold order.
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        cancelReason: 'OUT_OF_STOCK',
        cancelledBy: 'system',
        statusEvents: {
          create: { status: 'CANCELLED', note: 'Cancelled — stock deduction failed' },
        },
      },
    });
    throw new AppError(
      err instanceof Error ? err.message : 'Could not reserve stock for this order',
      409,
    );
  }

  if (shouldCreditWalletOnOrderCreate(paymentMethod as PaymentMethod)) {
    creditWalletForOrder(order.id, store.id, total, paymentMethod).catch(() => {});
  }

  notifyBranchNewOrder({
    orderId: order.id,
    orderNumber: order.orderNumber,
    storeId: store.id,
    storeName: store.name,
    orderMode,
    total,
    guestName,
    phone: guestPhone,
    itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    channel,
    items: mapNotifyOrderItems(order.items),
  }).catch(() => {});

  logger.info('messaging.order_created', {
    channel,
    orderNumber: order.orderNumber,
    storeId: store.id,
    total,
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    total,
    subtotal,
    deliveryFee,
    storeName: store.name,
    guestName,
    guestPhone,
    addressLine,
    city,
    orderMode,
    paymentMethod,
    items: pricedLines.map((l) => ({
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.unitPrice * l.quantity,
    })),
  };
}

export async function getRecentOrdersForCustomer(input: {
  customerId?: string | null;
  guestPhone?: string | null;
  limit?: number;
}) {
  const phone = input.guestPhone ? normalizePhone(input.guestPhone) : null;
  const variants = phone ? phoneLookupVariants(phone) : [];

  return prisma.order.findMany({
    where: {
      OR: [
        ...(input.customerId ? [{ userId: input.customerId }] : []),
        ...(variants.length ? [{ userId: null, guestPhone: { in: variants } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: input.limit ?? 5,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      channel: true,
      deliveryAddressLine: true,
      deliveryCity: true,
      createdAt: true,
      store: { select: { name: true } },
    },
  });
}

export async function getOrderTracking(orderNumberOrId: string) {
  return prisma.order.findFirst({
    where: {
      OR: [{ id: orderNumberOrId }, { orderNumber: orderNumberOrId }],
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      channel: true,
      orderMode: true,
      deliveryAddressLine: true,
      deliveryCity: true,
      store: { select: { name: true } },
      items: {
        select: { productName: true, quantity: true, totalPrice: true },
      },
    },
  });
}
