import type { Order, OrderItem } from '@/types';
import { appliesConvenienceFee, computeConvenienceFee } from '@/lib/fees';
import { itemOptionLine } from '@/lib/receipt';

export type OrderEditMode = 'full' | 'add_only';

type OrderBalanceFields = Pick<Order, 'paymentStatus' | 'balanceDue' | 'prepaidAmount' | 'total'>;

type OrderEditFields = Pick<
  Order,
  | 'orderMode'
  | 'paymentMethod'
  | 'paymentStatus'
  | 'status'
  | 'canEdit'
  | 'canAddItems'
  | 'editMode'
  | 'balanceDue'
  | 'prepaidAmount'
  | 'total'
>;

function isOnlinePaymentMethod(method: string): boolean {
  return method === 'PAYHERE' || method === 'CARD';
}

export function canEditOrder(order: OrderEditFields): boolean {
  if (order.canEdit != null) return order.canEdit;
  return (
    order.orderMode === 'TAKEAWAY' &&
    order.paymentMethod === 'CASH_AT_COUNTER' &&
    order.paymentStatus === 'PENDING' &&
    order.status !== 'DELIVERED' &&
    order.status !== 'CANCELLED'
  );
}

export function canAddItemsToOrder(order: OrderEditFields): boolean {
  if (order.canAddItems != null) return order.canAddItems;
  return (
    order.orderMode === 'TAKEAWAY' &&
    order.paymentStatus === 'PAID' &&
    order.status !== 'DELIVERED' &&
    order.status !== 'CANCELLED'
  );
}

export function getOrderEditMode(order: OrderEditFields): OrderEditMode | null {
  if (order.editMode != null) return order.editMode;
  if (canEditOrder(order)) return 'full';
  if (canAddItemsToOrder(order)) return 'add_only';
  return null;
}

export function orderBalanceDue(order: OrderBalanceFields): number {
  if (order.balanceDue != null) return order.balanceDue;
  if (order.paymentStatus !== 'PAID') return 0;
  const prepaid = order.prepaidAmount ?? 0;
  return Math.max(0, order.total - prepaid);
}

function shouldFreezeConvenienceFeeOnPreview(
  order: Pick<Order, 'orderMode' | 'paymentMethod' | 'paymentStatus'>,
  mode: OrderEditMode,
): boolean {
  if (mode === 'add_only') return true;
  return (
    mode === 'full' &&
    order.orderMode === 'TAKEAWAY' &&
    order.paymentMethod === 'CASH_AT_COUNTER' &&
    order.paymentStatus === 'PENDING'
  );
}

function previewConvenienceFee(
  order: Pick<Order, 'orderMode' | 'paymentMethod' | 'paymentStatus' | 'convenientFee'>,
  draftSubtotal: number,
  mode: OrderEditMode,
): number {
  if (shouldFreezeConvenienceFeeOnPreview(order, mode)) {
    return order.convenientFee ?? 0;
  }
  if (appliesConvenienceFee(order.orderMode, order.paymentMethod)) {
    return computeConvenienceFee(draftSubtotal, order.orderMode, order.paymentMethod);
  }
  return 0;
}

/** Preview order total while editing items (add-only keeps the original convenience fee). */
export function previewOrderTotalAfterEdit(
  order: Pick<
    Order,
    | 'orderMode'
    | 'paymentMethod'
    | 'paymentStatus'
    | 'subtotal'
    | 'convenientFee'
    | 'deliveryFee'
    | 'discount'
    | 'loyaltyDiscount'
  >,
  draftSubtotal: number,
  mode: OrderEditMode,
): number {
  const convenientFee = previewConvenienceFee(order, draftSubtotal, mode);
  return Math.max(
    0,
    draftSubtotal + convenientFee + order.deliveryFee - order.discount - order.loyaltyDiscount,
  );
}

/** Live preview: amount to collect at counter when adding items to a paid order. */
export function previewOrderBalanceDue(
  order: Pick<Order, 'paymentStatus' | 'subtotal'>,
  draftSubtotal: number,
  mode: OrderEditMode,
): number {
  if (mode !== 'add_only' || order.paymentStatus !== 'PAID') return 0;
  return Math.max(0, draftSubtotal - (order.subtotal ?? 0));
}

const ADMIN_ITEM_EDIT_NOTE = /Items (updated|added) by admin/;

export function orderWasEditedByAdmin(
  order: OrderEditFields & Pick<Order, 'statusEvents'>,
): boolean {
  if (orderBalanceDue(order) > 0) return true;
  return (
    order.statusEvents?.some((e) => e.note != null && ADMIN_ITEM_EDIT_NOTE.test(e.note)) ?? false
  );
}

export function orderTotalLabel(
  order: OrderEditFields & Pick<Order, 'statusEvents'>,
  edited?: boolean,
): string {
  return (edited ?? orderWasEditedByAdmin(order)) ? 'New total' : 'Total';
}

export function orderEditLockedMessage(order: OrderEditFields): string | null {
  if (getOrderEditMode(order)) return null;
  if (order.orderMode !== 'TAKEAWAY') {
    return 'Only pickup orders can be edited';
  }
  if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
    return 'Completed or cancelled orders cannot be edited';
  }
  if (
    order.canAddItems === false &&
    isOnlinePaymentMethod(order.paymentMethod) &&
    order.paymentStatus === 'PAID'
  ) {
    return 'Adding items to paid online orders is disabled in settings';
  }
  if (
    order.canEdit === false &&
    order.paymentMethod === 'CASH_AT_COUNTER' &&
    order.paymentStatus === 'PENDING'
  ) {
    return 'Cash pickup order editing is disabled in settings';
  }
  if (isOnlinePaymentMethod(order.paymentMethod) && order.paymentStatus !== 'PAID') {
    return 'Unpaid online order — wait for payment before adding items';
  }
  return 'This order cannot be edited';
}

export type UpdateOrderItemPayload =
  | { orderItemId: string; quantity: number }
  | {
      productId: string;
      size: 'REGULAR' | 'LARGE';
      sugarLevel: 'FIFTY' | 'HUNDRED' | null;
      iceLevel: 'LESS_ICE' | 'NORMAL_ICE' | null;
      toppingIds: string[];
      quantity: number;
    };

export type DraftOrderItem =
  | {
      kind: 'existing';
      orderItemId: string;
      productName: string;
      optionLine: string;
      unitPrice: number;
      quantity: number;
      originalQuantity: number;
    }
  | {
      kind: 'new';
      clientId: string;
      productId: string;
      productName: string;
      size: 'REGULAR' | 'LARGE';
      sugarLevel: 'FIFTY' | 'HUNDRED' | null;
      iceLevel: 'LESS_ICE' | 'NORMAL_ICE' | null;
      toppingIds: string[];
      unitPrice: number;
      quantity: number;
    };

export function orderItemsToDraft(items: OrderItem[]): DraftOrderItem[] {
  return items.map((item) => ({
    kind: 'existing' as const,
    orderItemId: item.id,
    productName: item.productName,
    optionLine: itemOptionLine(item),
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    originalQuantity: item.quantity,
  }));
}

export function draftToUpdatePayload(draft: DraftOrderItem[]): UpdateOrderItemPayload[] {
  return draft.map((item) => {
    if (item.kind === 'existing') {
      return { orderItemId: item.orderItemId, quantity: item.quantity };
    }
    return {
      productId: item.productId,
      size: item.size,
      sugarLevel: item.sugarLevel,
      iceLevel: item.iceLevel,
      toppingIds: item.toppingIds,
      quantity: item.quantity,
    };
  });
}
