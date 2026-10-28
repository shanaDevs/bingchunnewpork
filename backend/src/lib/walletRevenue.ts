import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { decimalFieldToCentsNumber } from './moneyDecimal';

export function isCardPaymentMethod(method: string): boolean {
  return method === 'CARD' || method === 'PAYHERE' || method === 'LOYALTY_POINTS';
}

export function isCounterCashPaymentMethod(method: string): boolean {
  return method === 'CASH_AT_COUNTER';
}

/** @deprecated Legacy COD — not offered for new orders. Use isCounterCashPaymentMethod for pickup cash. */
export function isCashPaymentMethod(method: string): boolean {
  return method === 'CASH_ON_DELIVERY' || method === 'CASH_AT_COUNTER';
}

export type OrderAddonInfo = {
  amountLkr: number;
  paymentMethod: string;
};

export type ChannelOrderInput = {
  id?: string;
  total: number;
  orderMode: string;
  paymentMethod: string;
  subtotal?: number;
  discount?: number;
  loyaltyDiscount?: number;
  deliveryFee?: number;
  convenientFee?: number;
  addonAmountLkr?: number;
  addonPaymentMethod?: string;
};

export async function fetchOrderAddonMap(
  orderIds: string[],
): Promise<Map<string, OrderAddonInfo>> {
  if (!orderIds.length) return new Map();
  const txns = await prisma.walletTransaction.findMany({
    where: { orderId: { in: orderIds }, type: 'ORDER_ADDON_PAYMENT' },
    select: { orderId: true, amount: true, paymentMethod: true },
  });
  return new Map(
    txns
      .filter((t): t is typeof t & { orderId: string } => !!t.orderId)
      .map((t) => [
        t.orderId,
        {
          amountLkr: decimalFieldToCentsNumber(t.amount) / 100,
          paymentMethod: t.paymentMethod ?? 'CASH_AT_COUNTER',
        },
      ]),
  );
}

export function enrichOrdersWithAddonPayments<T extends { id?: string }>(
  orders: T[],
  addonMap: Map<string, OrderAddonInfo>,
): Array<T & { addonAmountLkr?: number; addonPaymentMethod?: string }> {
  return orders.map((order) => {
    if (!order.id) return order;
    const addon = addonMap.get(order.id);
    if (!addon) return order;
    return {
      ...order,
      addonAmountLkr: addon.amountLkr,
      addonPaymentMethod: addon.paymentMethod,
    };
  });
}

function creditPickupAddonChannel(
  addonAmount: number,
  addonPaymentMethod: string | undefined,
  counters: { pickupCash: number; pickupCard: number },
): void {
  if (addonAmount <= 0) return;
  if (addonPaymentMethod === 'CARD' || addonPaymentMethod === 'LOYALTY_POINTS') {
    counters.pickupCard += addonAmount;
  } else {
    counters.pickupCash += addonAmount;
  }
}

/** Split paid-order revenue across channels (amounts in LKR, same unit as order.total). */
export function splitOrderChannelAmounts(order: ChannelOrderInput): {
  pickupCash: number;
  pickupCard: number;
  pickupOnline: number;
  deliveryCard: number;
} {
  const result = { pickupCash: 0, pickupCard: 0, pickupOnline: 0, deliveryCard: 0 };
  const addonAmount = order.addonAmountLkr ?? 0;
  const primaryAmount = order.total - addonAmount;

  if (order.orderMode === 'TAKEAWAY') {
    if (isCounterCashPaymentMethod(order.paymentMethod)) {
      result.pickupCash += primaryAmount;
    } else if (order.paymentMethod === 'PAYHERE') {
      result.pickupOnline += primaryAmount;
    } else if (order.paymentMethod === 'CARD' || order.paymentMethod === 'LOYALTY_POINTS') {
      result.pickupCard += primaryAmount;
    }
    creditPickupAddonChannel(addonAmount, order.addonPaymentMethod, result);
  } else if (order.orderMode === 'DELIVERY' && isCardPaymentMethod(order.paymentMethod)) {
    result.deliveryCard += order.total;
  }

  return result;
}

/** Split item sales (excluding delivery/convenience fees) across channels. */
export function splitPlatformSalesChannelAmounts(order: ChannelOrderInput): {
  pickupCash: number;
  pickupCard: number;
  pickupOnline: number;
  deliveryCard: number;
} {
  const result = { pickupCash: 0, pickupCard: 0, pickupOnline: 0, deliveryCard: 0 };
  const addonAmount = order.addonAmountLkr ?? 0;
  const primaryItemSales = Math.max(0, platformItemSalesLkr(order) - addonAmount);

  if (order.orderMode === 'TAKEAWAY') {
    if (isCounterCashPaymentMethod(order.paymentMethod)) {
      result.pickupCash += primaryItemSales;
    } else if (order.paymentMethod === 'PAYHERE') {
      result.pickupOnline += primaryItemSales;
    } else if (order.paymentMethod === 'CARD' || order.paymentMethod === 'LOYALTY_POINTS') {
      result.pickupCard += primaryItemSales;
    }
    creditPickupAddonChannel(addonAmount, order.addonPaymentMethod, result);
  } else if (order.orderMode === 'DELIVERY' && isCardPaymentMethod(order.paymentMethod)) {
    result.deliveryCard += platformItemSalesLkr(order);
  }

  return result;
}

/** Paid-order revenue by channel (amounts in LKR, same unit as order.total). */
export function summarizeRevenueChannelsLkr(orders: ChannelOrderInput[]) {
  let pickupCash = 0;
  let pickupCard = 0;
  let pickupOnline = 0;
  let deliveryCard = 0;

  for (const order of orders) {
    const split = splitOrderChannelAmounts(order);
    pickupCash += split.pickupCash;
    pickupCard += split.pickupCard;
    pickupOnline += split.pickupOnline;
    deliveryCard += split.deliveryCard;
  }

  return { pickupCash, pickupCard, pickupOnline, deliveryCard };
}

export type PlatformSalesSummaryLkr = {
  totalPlatformSales: number;
  onlineSales: number;
  pickupCash: number;
  pickupCard: number;
  pickupOnline: number;
  deliveryOnline: number;
  offlineCash: number;
  offlineCard: number;
  offlineTotal: number;
  orderCount: number;
};

type PlatformSalesOrder = ChannelOrderInput;

/** Item sales value excluding delivery and convenience fees (LKR). */
export function platformItemSalesLkr(order: PlatformSalesOrder): number {
  if (typeof order.subtotal === 'number') {
    return Math.max(
      0,
      order.subtotal - (order.discount ?? 0) - (order.loyaltyDiscount ?? 0),
    );
  }
  return Math.max(0, order.total - (order.deliveryFee ?? 0) - (order.convenientFee ?? 0));
}

/** All paid platform item sales by payment type (amounts in LKR, excludes delivery/convenience fees). */
export function summarizePlatformSalesLkr(
  orders: PlatformSalesOrder[],
): PlatformSalesSummaryLkr {
  let pickupCash = 0;
  let pickupCard = 0;
  let pickupOnline = 0;
  let deliveryOnline = 0;

  for (const order of orders) {
    const split = splitPlatformSalesChannelAmounts(order);
    pickupCash += split.pickupCash;
    pickupCard += split.pickupCard;
    pickupOnline += split.pickupOnline;
    deliveryOnline += split.deliveryCard;
  }

  const onlineSales = pickupOnline + deliveryOnline;
  const offlineCash = pickupCash;
  const offlineCard = pickupCard;
  const totalPlatformSales = orders.reduce((sum, o) => sum + platformItemSalesLkr(o), 0);

  return {
    totalPlatformSales,
    onlineSales,
    pickupCash,
    pickupCard,
    pickupOnline,
    deliveryOnline,
    offlineCash,
    offlineCard,
    offlineTotal: offlineCash + offlineCard,
    orderCount: orders.length,
  };
}

/** Revenue breakdown from paid orders (source of truth for period stats). Amounts in cents. */
export function summarizeOrderRevenue(
  orders: { total: number; orderMode: string; paymentMethod: string }[],
) {
  let totalIn = 0;
  let pickupCashIn = 0;
  let pickupCardIn = 0;
  let deliveryCardIn = 0;

  for (const o of orders) {
    const cents = o.total * 100;
    totalIn += cents;
    const isCard = isCardPaymentMethod(o.paymentMethod);
    if (o.orderMode === 'DELIVERY') {
      if (isCard) deliveryCardIn += cents;
    } else if (o.orderMode === 'TAKEAWAY') {
      if (isCard) pickupCardIn += cents;
      else if (isCounterCashPaymentMethod(o.paymentMethod)) pickupCashIn += cents;
    }
  }

  const deliveryIn = deliveryCardIn;
  const pickupOnlineIn = pickupCardIn;
  const pickupStoreIn = pickupCashIn;

  return {
    totalIn,
    pickupCashIn,
    pickupCardIn,
    deliveryCardIn,
    deliveryIn,
    pickupOnlineIn,
    pickupStoreIn,
  };
}

/** Same totals as summarizing each paid order row; used with `order.groupBy` for dashboard loads. */
export function summarizeOrderRevenueFromGroups(
  groups: { orderMode: string; paymentMethod: string; totalSum: number }[],
) {
  return summarizeOrderRevenue(
    groups.map((g) => ({
      total: g.totalSum,
      orderMode: g.orderMode,
      paymentMethod: g.paymentMethod,
    })),
  );
}

export async function fetchSummarizedPaidOrderRevenue(where: Prisma.OrderWhereInput) {
  const groups = await prisma.order.groupBy({
    by: ['orderMode', 'paymentMethod'],
    where: { ...where, paymentStatus: 'PAID' },
    _sum: { total: true },
  });
  return summarizeOrderRevenueFromGroups(
    groups.map((g) => ({
      orderMode: g.orderMode,
      paymentMethod: g.paymentMethod,
      totalSum: g._sum.total ?? 0,
    })),
  );
}

const walletReportOrderSelect = {
  id: true,
  orderNumber: true,
  createdAt: true,
  orderMode: true,
  paymentMethod: true,
  paymentStatus: true,
  status: true,
  total: true,
  guestName: true,
  guestPhone: true,
  queuePosition: true,
  store: { select: { name: true } },
  items: { select: { productName: true, quantity: true } },
} as const;

export type WalletReportOrderRow = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  orderMode: string;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  total: number;
  guestName: string | null;
  guestPhone: string | null;
  queuePosition: number | null;
  store: { name: string };
  items: { productName: string; quantity: number }[];
};

export function mapWalletReportOrders(orders: WalletReportOrderRow[]) {
  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    orderMode: o.orderMode,
    paymentMethod: o.paymentMethod,
    paymentChannel: isCardPaymentMethod(o.paymentMethod) ? 'CARD' : 'CASH',
    paymentStatus: o.paymentStatus,
    status: o.status,
    total: o.total,
    guestName: o.guestName,
    guestPhone: o.guestPhone,
    queuePosition: o.queuePosition,
    storeName: o.store.name,
    itemSummary: o.items
      .slice(0, 3)
      .map((i) => `${i.quantity}× ${i.productName}`)
      .join(', ') + (o.items.length > 3 ? ` +${o.items.length - 3} more` : ''),
  }));
}

export { walletReportOrderSelect };

export function orderCreatedAtFilter(from?: string, to?: string) {
  if (!from && !to) return {};
  return {
    createdAt: {
      ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    },
  };
}

/**
 * Orders that count toward period wallet loyalty, commission, and channel preview.
 * - `paymentStatus: 'PAID'` allow-list excludes REFUNDED / FAILED / PENDING.
 * - `status: { not: 'CANCELLED' }` is required even while payment stays PAID until refund
 *   completes — otherwise branch-cancelled loyaltyDiscount would keep reducing net platform earning.
 */
export function periodActivePaidOrdersWhere(storeId: string, from?: string, to?: string) {
  return {
    storeId,
    paymentStatus: 'PAID' as const,
    status: { not: 'CANCELLED' as const },
    ...orderCreatedAtFilter(from, to),
  };
}
