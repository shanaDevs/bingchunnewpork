import type { OrderMode } from '@/store/cartStore';

type OrderSetupState = {
  orderMode: OrderMode | null;
  deliveryInfo: { storeId: string } | null;
  takeawayInfo: { storeId: string } | null;
};

/** True when the customer has completed delivery or pickup setup. */
export function hasCompletedOrderSetup({
  deliveryInfo,
  takeawayInfo,
}: OrderSetupState): boolean {
  return Boolean(deliveryInfo?.storeId || takeawayInfo?.storeId);
}
