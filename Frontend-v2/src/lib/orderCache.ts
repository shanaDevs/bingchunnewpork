import type { QueryClient } from '@tanstack/react-query';
import type { Order, OrderStatus } from '@/types';

/** Customer-facing order list caches (My Orders, menu sort, etc.). */
export function invalidateCustomerOrderLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['my-orders'] });
  void queryClient.invalidateQueries({ queryKey: ['orders', 'my'] });
}

export type OrderStatusPatch = {
  orderId?: string;
  orderNumber?: string;
  status?: OrderStatus;
  note?: string | null;
  queuePosition?: number | null;
  scheduledPickupAt?: string | null;
};

function matchesOrder(order: Order, patch: OrderStatusPatch, cacheKey: string): boolean {
  if (cacheKey === order.id || cacheKey === order.orderNumber) return true;
  if (patch.orderId && order.id === patch.orderId) return true;
  if (patch.orderNumber && order.orderNumber === patch.orderNumber) return true;
  return false;
}

/** Apply a live socket status patch to React Query order caches without refetching. */
export function patchOrderInQueryCache(
  queryClient: QueryClient,
  cacheKeys: Array<string | undefined>,
  patch: OrderStatusPatch,
): void {
  const keys = cacheKeys.filter((key): key is string => typeof key === 'string' && key.length > 0);
  if (!keys.length) return;

  for (const key of keys) {
    queryClient.setQueryData<Order>(['order', key], (old) => {
      if (!old || !matchesOrder(old, patch, key)) return old;
      return {
        ...old,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.queuePosition !== undefined ? { queuePosition: patch.queuePosition } : {}),
        ...(patch.scheduledPickupAt !== undefined
          ? { scheduledPickupAt: patch.scheduledPickupAt }
          : {}),
      };
    });
  }

  queryClient.setQueriesData<Order[]>({ queryKey: ['my-orders'] }, (old) => {
    if (!old?.length) return old;
    return old.map((order) =>
      matchesOrder(order, patch, order.id) || matchesOrder(order, patch, order.orderNumber)
        ? {
            ...order,
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.queuePosition !== undefined ? { queuePosition: patch.queuePosition } : {}),
            ...(patch.scheduledPickupAt !== undefined
              ? { scheduledPickupAt: patch.scheduledPickupAt }
              : {}),
          }
        : order,
    );
  });
}
