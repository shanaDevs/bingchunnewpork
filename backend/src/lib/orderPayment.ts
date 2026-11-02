import type { Order, PaymentMethod, Prisma } from '@prisma/client';
import type { PickupOrderEditSettings } from './appSchema';
import { DEFAULT_PICKUP_ORDER_EDIT_SETTINGS } from './appSchema';

export type FulfillmentQueueKind = 'pickup' | 'delivery';

const ONLINE_METHODS: PaymentMethod[] = ['PAYHERE', 'CARD'];

/** Payment methods that receive ORDER_PAYMENT wallet credits during sync/recovery. */
export const WALLET_CREDIT_METHODS = ['PAYHERE', 'CARD', 'LOYALTY_POINTS'] as const;

export type WalletCreditPaymentMethod = (typeof WALLET_CREDIT_METHODS)[number];

export function isOnlinePaymentMethod(method: PaymentMethod): boolean {
  return ONLINE_METHODS.includes(method);
}

/** Methods that create branch wallet ORDER_PAYMENT credits (live + sync must match). */
export function isWalletCreditPaymentMethod(
  method: PaymentMethod,
): method is WalletCreditPaymentMethod {
  return (WALLET_CREDIT_METHODS as readonly PaymentMethod[]).includes(method);
}

/** Branch pickup queue: hide unpaid PayHere/card checkout; keep cash-at-counter unpaid. */
export function fulfillmentQueuePaymentWhere(queue: FulfillmentQueueKind): Prisma.OrderWhereInput {
  if (queue === 'delivery') {
    return { paymentStatus: 'PAID' };
  }

  return {
    OR: [{ paymentStatus: 'PAID' }, { paymentMethod: 'CASH_AT_COUNTER' }],
  };
}

/** Promo analysis: paid orders + unpaid pickup cash-at-counter (discount applied at create). */
export function promoAnalysisOrderPaymentWhere(): Prisma.OrderWhereInput {
  return {
    OR: [{ paymentStatus: 'PAID' }, { paymentMethod: 'CASH_AT_COUNTER' }],
  };
}

/**
 * Convenience fee applies to:
 * - Delivery / pickup paid online (CARD / PAYHERE)
 * - Pickup paid cash at counter (only available under the LKR 1000 online threshold)
 */
export function appliesConvenienceFee(orderMode: string, paymentMethod: PaymentMethod): boolean {
  if (orderMode !== 'DELIVERY' && orderMode !== 'TAKEAWAY') return false;
  if (isOnlinePaymentMethod(paymentMethod)) return true;
  return orderMode === 'TAKEAWAY' && paymentMethod === 'CASH_AT_COUNTER';
}

/** Convenience fee rate for an order mode (pickup vs delivery). */
export function convenienceFeeRateForOrder(
  orderMode: string,
  rates: { pickup: number; delivery: number },
): number {
  if (orderMode === 'TAKEAWAY') return rates.pickup;
  if (orderMode === 'DELIVERY') return rates.delivery;
  return 0;
}

/** Initial status when the order is first placed */
export function initialPaymentStatus(method: PaymentMethod): 'PAID' | 'PENDING' {
  if (method === 'LOYALTY_POINTS') return 'PAID';
  return 'PENDING';
}

/** Deduct branch stock at order create for non-online methods (cash counter, COD, loyalty). */
export function shouldDeductStockOnOrderCreate(method: PaymentMethod): boolean {
  return !isOnlinePaymentMethod(method);
}

/** Mark paid when order is delivered and cash was collected at fulfillment */
export function paymentStatusOnOrderStatus(
  order: Pick<Order, 'paymentMethod' | 'paymentStatus' | 'orderMode'>,
  newStatus: string
): 'PAID' | undefined {
  if (order.paymentStatus === 'PAID') return undefined;

  if (newStatus === 'DELIVERED' && order.paymentMethod === 'CASH_ON_DELIVERY') {
    return 'PAID';
  }

  if (newStatus === 'DELIVERED' && order.paymentMethod === 'CASH_AT_COUNTER') {
    return 'PAID';
  }

  return undefined;
}

export function orderBalanceDue(order: {
  paymentStatus: string;
  total: number;
  prepaidAmount: number;
}): number {
  if (order.paymentStatus !== 'PAID') return 0;
  return Math.max(0, order.total - order.prepaidAmount);
}

/** Admin may fully edit takeaway orders when customer pays cash at counter (not yet paid). */
export function canAdminEditOrder(
  order: {
    orderMode: string;
    paymentMethod: PaymentMethod;
    paymentStatus: string;
    status: string;
  },
  settings: PickupOrderEditSettings = DEFAULT_PICKUP_ORDER_EDIT_SETTINGS,
): boolean {
  return (
    settings.allowEditCashUnpaid &&
    order.orderMode === 'TAKEAWAY' &&
    order.paymentMethod === 'CASH_AT_COUNTER' &&
    order.paymentStatus === 'PENDING' &&
    order.status !== 'DELIVERED' &&
    order.status !== 'CANCELLED'
  );
}

/** Admin may add items on paid takeaway orders (online paid gated by settings). */
export function canAdminAddOrderItems(
  order: {
    orderMode: string;
    paymentMethod: PaymentMethod;
    paymentStatus: string;
    status: string;
  },
  settings: PickupOrderEditSettings = DEFAULT_PICKUP_ORDER_EDIT_SETTINGS,
): boolean {
  if (
    order.orderMode !== 'TAKEAWAY' ||
    order.paymentStatus !== 'PAID' ||
    order.status === 'DELIVERED' ||
    order.status === 'CANCELLED'
  ) {
    return false;
  }

  if (isOnlinePaymentMethod(order.paymentMethod)) {
    return settings.allowAddItemsPaidOnline;
  }

  return true;
}

/**
 * Keep the convenience fee from the initial online placement when counter staff
 * add items. Counter add-ons must not attract a new convenience fee.
 */
export function shouldFreezeConvenienceFeeOnItemEdit(
  order: {
    orderMode: string;
    paymentMethod: PaymentMethod;
    paymentStatus: string;
    subtotal: number;
  },
  mode: { fullEdit: boolean; addOnly: boolean },
  nextSubtotal: number,
  hasNewItems: boolean,
): boolean {
  if (mode.addOnly && !mode.fullEdit) return true;

  if (
    mode.fullEdit &&
    order.orderMode === 'TAKEAWAY' &&
    order.paymentMethod === 'CASH_AT_COUNTER' &&
    order.paymentStatus === 'PENDING'
  ) {
    return true;
  }

  return false;
}

export function adminOrderEditMode(
  order: {
    orderMode: string;
    paymentMethod: PaymentMethod;
    paymentStatus: string;
    status: string;
  },
  settings: PickupOrderEditSettings = DEFAULT_PICKUP_ORDER_EDIT_SETTINGS,
): 'full' | 'add_only' | null {
  if (canAdminEditOrder(order, settings)) return 'full';
  if (canAdminAddOrderItems(order, settings)) return 'add_only';
  return null;
}

export function adminEditOrderDeniedMessage(
  order: {
    paymentMethod: PaymentMethod;
    paymentStatus: string;
    orderMode: string;
    status: string;
  },
  settings: PickupOrderEditSettings = DEFAULT_PICKUP_ORDER_EDIT_SETTINGS,
): string {
  if (canAdminAddOrderItems(order, settings)) {
    return 'Use add-items mode for paid pickup orders';
  }
  if (order.orderMode !== 'TAKEAWAY') {
    return 'Only pickup orders can be edited';
  }
  if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
    return 'Completed or cancelled orders cannot be edited';
  }
  if (
    !settings.allowEditCashUnpaid &&
    order.paymentMethod === 'CASH_AT_COUNTER' &&
    order.paymentStatus === 'PENDING'
  ) {
    return 'Cash pickup order editing is disabled in settings';
  }
  if (
    !settings.allowAddItemsPaidOnline &&
    isOnlinePaymentMethod(order.paymentMethod) &&
    order.paymentStatus === 'PAID'
  ) {
    return 'Adding items to paid online orders is disabled in settings';
  }
  if (isOnlinePaymentMethod(order.paymentMethod) && order.paymentStatus !== 'PAID') {
    return 'Unpaid online orders cannot be edited — wait for payment or cancel';
  }
  if (order.paymentMethod === 'CASH_AT_COUNTER' && order.paymentStatus === 'PAID') {
    return 'Paid cash orders can only add items';
  }
  return 'This order cannot be edited';
}

export function adminAddItemsDeniedMessage(
  order: {
    paymentMethod: PaymentMethod;
    paymentStatus: string;
    orderMode: string;
    status: string;
  },
  settings: PickupOrderEditSettings = DEFAULT_PICKUP_ORDER_EDIT_SETTINGS,
): string {
  if (canAdminEditOrder(order, settings)) {
    return 'Use full edit mode for unpaid cash orders';
  }
  return adminEditOrderDeniedMessage(order, settings);
}
