import type { QueryClient } from '@tanstack/react-query';

export const ADMIN_NEW_ORDER_EVENT = 'bc-admin-new-order';

export type AdminNewOrderSocketPayload = {
  orderId?: string | null;
  orderNumber?: string;
  orderMode?: string;
  storeName?: string;
  total?: number;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  queuePosition?: number | null;
  pickupTime?: string | null;
  scheduledPickupAt?: string | null;
  createdAt?: string;
  items?: Array<{ productName: string; quantity: number; imageUrl?: string | null }>;
};

export type OptimisticAdminOrderRow = {
  id: string;
  orderNumber: string;
  orderMode: string;
  status: string;
  total: number;
  createdAt: string;
  paymentMethod: string;
  paymentStatus: string;
  queuePosition?: number | null;
  pickupTime?: string | null;
  scheduledPickupAt?: string | null;
  items?: Array<{ productName: string; quantity: number }>;
  store?: { name?: string };
};

type AdminOrdersQueryKey = [
  'admin-orders',
  'pickup' | 'delivery',
  'delivered' | 'cancelled' | null | undefined,
  unknown,
  string,
  number,
  string,
  'asc' | 'desc',
];

type AdminOrdersListResponse = {
  data?: OptimisticAdminOrderRow[];
  meta?: { total?: number; pages?: number; page?: number; limit?: number };
};

export function snapshotFromNewOrderPayload(
  payload: AdminNewOrderSocketPayload,
): OptimisticAdminOrderRow | null {
  const orderId = payload.orderId?.trim();
  const orderNumber = payload.orderNumber?.trim();
  if (!orderId || !orderNumber) return null;

  return {
    id: orderId,
    orderNumber,
    orderMode: payload.orderMode || 'TAKEAWAY',
    status: payload.status || 'RECEIVED',
    total: payload.total ?? 0,
    createdAt: payload.createdAt || new Date().toISOString(),
    paymentMethod: payload.paymentMethod || 'CASH_AT_COUNTER',
    paymentStatus: payload.paymentStatus || 'PAID',
    queuePosition: payload.queuePosition ?? null,
    pickupTime: payload.pickupTime ?? null,
    scheduledPickupAt: payload.scheduledPickupAt ?? null,
    items: payload.items || [],
    store: payload.storeName ? { name: payload.storeName } : undefined,
  };
}

function orderMatchesQuery(order: OptimisticAdminOrderRow, queryKey: AdminOrdersQueryKey): boolean {
  const [, activeTab, archiveView, , statusFilter, page, appliedSearch] = queryKey;

  if (archiveView) return false;
  if (page !== 1) return false;
  if (appliedSearch) return false;

  const expectedTab = order.orderMode === 'DELIVERY' ? 'delivery' : 'pickup';
  if (activeTab !== expectedTab) return false;

  if (statusFilter && statusFilter !== 'active' && order.status !== statusFilter) {
    return false;
  }

  return true;
}

export function upsertOptimisticAdminOrder(
  qc: QueryClient,
  order: OptimisticAdminOrderRow,
): void {
  for (const query of qc.getQueryCache().findAll({ queryKey: ['admin-orders'] })) {
    const queryKey = query.queryKey as AdminOrdersQueryKey;
    if (!orderMatchesQuery(order, queryKey)) continue;

    qc.setQueryData<AdminOrdersListResponse>(query.queryKey, (prev) => {
      if (!prev?.data) return prev;

      if (
        prev.data.some(
          (row: OptimisticAdminOrderRow) =>
            row.id === order.id || row.orderNumber === order.orderNumber,
        )
      ) {
        return prev;
      }

      const sortDir = queryKey[7] ?? 'asc';
      const nextData =
        sortDir === 'desc'
          ? [order, ...prev.data]
          : [...prev.data, order];

      return {
        ...prev,
        data: nextData,
        meta: prev.meta
          ? { ...prev.meta, total: (prev.meta.total ?? prev.data.length) + 1 }
          : prev.meta,
      };
    });
  }

  for (const query of qc.getQueryCache().findAll({ queryKey: ['admin-orders-queue-counts'] })) {
    const activeTab = query.queryKey[1];
    qc.setQueryData<{
      tabs: { pickup: number; delivery: number };
      status: { RECEIVED: number; PREPARING: number; READY: number };
    }>(query.queryKey, (prev) => {
      if (!prev?.tabs) return prev;
      const nextTabs = { ...prev.tabs };
      if (order.orderMode === 'TAKEAWAY') nextTabs.pickup += 1;
      if (order.orderMode === 'DELIVERY') nextTabs.delivery += 1;
      const nextStatus = { ...prev.status };
      // New orders land in RECEIVED for the active queue tab.
      if (
        (order.orderMode === 'TAKEAWAY' && activeTab === 'pickup') ||
        (order.orderMode === 'DELIVERY' && activeTab === 'delivery')
      ) {
        nextStatus.RECEIVED = (nextStatus.RECEIVED ?? 0) + 1;
      }
      return { ...prev, tabs: nextTabs, status: nextStatus };
    });
  }
}

export function dispatchAdminNewOrder(payload: AdminNewOrderSocketPayload): void {
  const snapshot = snapshotFromNewOrderPayload(payload);
  if (!snapshot) return;

  window.dispatchEvent(
    new CustomEvent(ADMIN_NEW_ORDER_EVENT, {
      detail: snapshot,
    }),
  );
}
