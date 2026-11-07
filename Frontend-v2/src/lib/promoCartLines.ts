import type { LocalCartItem } from '@/store/cartStore';

export interface PromoCartLinePayload {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  categoryName?: string;
}

export function cartItemsToPromoPayload(items: LocalCartItem[]): PromoCartLinePayload[] {
  return items.map((item) => ({
    productId: item.product.id,
    productName: item.product.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.unitPrice * item.quantity,
    categoryName: item.product.category?.name,
  }));
}
