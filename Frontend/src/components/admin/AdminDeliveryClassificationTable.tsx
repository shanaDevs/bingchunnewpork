'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Map, Route, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminDeliveryLocationModal, {
  hasDeliveryMapLocation,
  type DeliveryLocationStop,
} from '@/components/admin/AdminDeliveryLocationModal';
import AdminDeliveryRouteModal, {
  type PendingDeliveryJob,
} from '@/components/admin/AdminDeliveryRouteModal';
import AdminOrderItemsCompact from '@/components/admin/AdminOrderItemsCompact';
import type { DeliveryRoutePayload } from '@/lib/deliveryRoute';
import { getAdminSession, isSuperAdmin, type AdminSession } from '@/lib/adminAuth';
import { adminBadgeClass, paymentStatusBadgeVariant } from '@/lib/adminBadges';
import {
  canAddOrderToSelection,
  groupLimitMessage,
  isValidDeliveryGroup,
  orderCupCount,
  selectionOrderCount,
  selectionTotalCups,
  type DeliverySelectionMap,
} from '@/lib/deliverySelection';
import { useMaxCupsPerRider } from '@/hooks/useMaxCupsPerRider';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';
import { isOrderPaid } from '@/lib/receipt';
import type { PaymentMethod } from '@/types';

type PendingDeliveryOrder = {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  addressLine: string;
  city: string;
  district: string;
  paymentMethod: string;
  paymentStatus: string;
  total: number;
  hasLocation: boolean;
  lat?: number | null;
  lng?: number | null;
  items: { productName: string; quantity: number; imageUrl?: string | null }[];
};

type Props = {
  visible: boolean;
  adminFetch: (endpoint: string, options?: RequestInit) => Promise<{ data?: unknown }>;
};

function PaymentStatusBadge({ paymentStatus, paymentMethod }: { paymentStatus: string; paymentMethod: string }) {
  const payment = { paymentStatus, paymentMethod: paymentMethod as PaymentMethod };
  const paid = isOrderPaid(payment);
  const label = paid ? 'Paid' : paymentStatus === 'FAILED' ? 'Failed' : 'Unpaid';
  return <span className={adminBadgeClass(paymentStatusBadgeVariant(payment))}>{label}</span>;
}

function formatOrderedAt(iso: string) {
  return new Date(iso).toLocaleString('en-LK', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminDeliveryClassificationTable({ visible, adminFetch }: Props) {
  const qc = useQueryClient();
  const maxCupsPerRider = useMaxCupsPerRider();
  const [mounted, setMounted] = useState(false);
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [storeId, setStoreId] = useState('');
  const [selection, setSelection] = useState<DeliverySelectionMap>({});
  const [page, setPage] = useState(1);
  const [locationModalStop, setLocationModalStop] = useState<DeliveryLocationStop | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [routeModalLoading, setRouteModalLoading] = useState(false);
  const [pendingJob, setPendingJob] = useState<PendingDeliveryJob | null>(null);

  useEffect(() => {
    const session = getAdminSession();
    setAdmin(session);
    if (session && !isSuperAdmin(session) && session.storeId) setStoreId(session.storeId);
    setMounted(true);
  }, []);

  const { data: stores = [] } = useQuery({
    queryKey: ['admin-stores-list'],
    queryFn: async () => (await adminFetch('/stores')).data as { id: string; name: string }[],
    enabled: mounted && visible && isSuperAdmin(admin),
  });

  useEffect(() => {
    if (isSuperAdmin(admin) && stores.length > 0 && !storeId) setStoreId(stores[0].id);
  }, [admin, stores, storeId]);

  useEffect(() => {
    if (!visible) {
      setSelection({});
      setPage(1);
    }
  }, [visible]);

  useEffect(() => {
    setPage(1);
  }, [storeId]);

  const { data: pendingOrdersData, isLoading } = useQuery({
    queryKey: ['admin-delivery-pending-orders', storeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (storeId) params.set('storeId', storeId);
      const res = await adminFetch(`/admin/delivery/pending-orders?${params}`);
      return Array.isArray(res.data) ? (res.data as PendingDeliveryOrder[]) : [];
    },
    enabled: mounted && visible && Boolean(storeId),
    refetchInterval: 15000,
  });
  const pendingOrders = Array.isArray(pendingOrdersData) ? pendingOrdersData : [];

  const createJob = useMutation({
    mutationFn: (payload: { title: string; orderIds: string[] }) =>
      adminFetch('/admin/delivery-jobs', {
        method: 'POST',
        body: JSON.stringify({ storeId, title: payload.title, orderIds: payload.orderIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-delivery-pending-orders'] });
      qc.invalidateQueries({ queryKey: ['admin-delivery-jobs'] });
      qc.invalidateQueries({ queryKey: ['admin-delivery-jobs-active'] });
      qc.invalidateQueries({ queryKey: ['admin-delivery-jobs-completed'] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      qc.invalidateQueries({ queryKey: ['admin-orders-count'] });
      toast.success('Delivery job created');
      setRouteModalOpen(false);
      setPendingJob(null);
      setSelection({});
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create delivery job'),
  });

  const totalItems = pendingOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ADMIN_TABLE_PAGE_SIZE));
  const pageList = buildPageList(page, totalPages);
  const rangeStart = totalItems === 0 ? 0 : (page - 1) * ADMIN_TABLE_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * ADMIN_TABLE_PAGE_SIZE, totalItems);
  const pageOrders = pendingOrders.slice(
    (page - 1) * ADMIN_TABLE_PAGE_SIZE,
    page * ADMIN_TABLE_PAGE_SIZE
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const selectedCount = selectionOrderCount(selection);
  const selectedCups = selectionTotalCups(selection);
  const limitMessage = groupLimitMessage(selectedCups, selectedCount, maxCupsPerRider);
  const canCreateJob = isValidDeliveryGroup(selectedCups, selectedCount, maxCupsPerRider) && !createJob.isPending;

  const toggleSelection = useCallback((order: PendingDeliveryOrder, checked: boolean) => {
    const cups = orderCupCount(order.items);
    const orderId = order.orderId;

    setSelection((prev) => {
      if (!checked) {
        if (!prev[orderId]) return prev;
        const next = { ...prev };
        delete next[orderId];
        return next;
      }

      const check = canAddOrderToSelection(prev, cups, maxCupsPerRider);
      if (!check.ok) {
        toast.error(check.message ?? `Max ${maxCupsPerRider} cups per rider per group`);
        return prev;
      }

      return {
        ...prev,
        [orderId]: { orderNumber: order.orderNumber, cups },
      };
    });
  }, [maxCupsPerRider]);

  const allSelected =
    pageOrders.length > 0 && pageOrders.every((order) => selection[order.orderId]);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelection((prev) => {
        const next = { ...prev };
        for (const order of pageOrders) delete next[order.orderId];
        return next;
      });
      return;
    }

    setSelection((prev) => {
      let next = { ...prev };
      for (const order of pageOrders) {
        if (next[order.orderId]) continue;
        const cups = orderCupCount(order.items);
        const check = canAddOrderToSelection(next, cups, maxCupsPerRider);
        if (!check.ok) break;
        next = { ...next, [order.orderId]: { orderNumber: order.orderNumber, cups } };
      }
      return next;
    });
  }, [allSelected, pageOrders, maxCupsPerRider]);

  const handleCreateJob = async () => {
    const orderIds = Object.keys(selection);
    if (!storeId || orderIds.length === 0) {
      toast.error('Select at least one READY delivery order');
      return;
    }
    if (!isValidDeliveryGroup(selectedCups, selectedCount, maxCupsPerRider)) {
      toast.error(limitMessage ?? `Max ${maxCupsPerRider} cups per rider per group`);
      return;
    }

    const title = `Delivery · ${orderIds.length} order${orderIds.length === 1 ? '' : 's'} (${selectedCups} cup${selectedCups === 1 ? '' : 's'})`;
    setRouteModalOpen(true);
    setRouteModalLoading(true);
    setPendingJob({
      title,
      orderIds,
      route: {
        store: { id: storeId, name: 'Branch', lat: 0, lng: 0, addressLine: '', city: '' },
        stops: [],
        path: [],
        summary: { stopCount: 0, totalDistanceKm: 0, estimatedMinutes: 0 },
      },
    });

    try {
      const res = await adminFetch('/admin/delivery/preview-route', {
        method: 'POST',
        body: JSON.stringify({ storeId, orderIds, title }),
      });
      const route = res.data as DeliveryRoutePayload;
      setPendingJob({ title, orderIds, route });
    } catch (e: unknown) {
      setRouteModalOpen(false);
      setPendingJob(null);
      toast.error(e instanceof Error ? e.message : 'Could not build route preview');
    } finally {
      setRouteModalLoading(false);
    }
  };

  function confirmCreateJob() {
    if (!pendingJob) return;
    createJob.mutate({ title: pendingJob.title, orderIds: pendingJob.orderIds });
  }

  if (!visible || !mounted || !storeId) return null;

  return (
    <div className="card mt-6 mb-24 overflow-hidden">
      <AdminDeliveryLocationModal stop={locationModalStop} onClose={() => setLocationModalStop(null)} />
      <AdminDeliveryRouteModal
        open={routeModalOpen}
        loading={routeModalLoading}
        confirming={createJob.isPending}
        pendingJob={pendingJob}
        onClose={() => {
          if (createJob.isPending) return;
          setRouteModalOpen(false);
          setPendingJob(null);
        }}
        onConfirm={confirmCreateJob}
      />
      <div className="border-b border-navy-border px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-fg flex items-center gap-2">
              <Route size={20} className="text-brand" />
              Classify READY delivery orders
            </h2>
            <p className="text-muted text-xs mt-1">
              Select orders below to build a delivery group. Each rider can carry at most{' '}
              <span className="font-semibold text-fg">{maxCupsPerRider} cups</span>.
            </p>
          </div>
          {isSuperAdmin(admin) && stores.length > 0 && (
            <select
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                setSelection({});
                setPage(1);
              }}
              className="bg-navy-light border border-navy-border rounded-lg px-3 py-2 text-white text-sm shrink-0"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="sticky top-0 z-20 admin-table__selection-bar px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm min-w-0">
              <p className="font-semibold text-fg">
                {selectedCount} order{selectedCount === 1 ? '' : 's'} selected for this group
              </p>
              <p className="text-xs text-muted mt-0.5">
                {selectedCups} cup{selectedCups === 1 ? '' : 's'} · max {maxCupsPerRider} per rider
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button type="button" onClick={() => setSelection({})} className="btn-outline px-4 py-2.5 text-sm">
                Clear selection
              </button>
              <button
                type="button"
                onClick={handleCreateJob}
                disabled={!canCreateJob || routeModalLoading}
                className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {createJob.isPending || routeModalLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Truck size={16} />
                )}
                Create delivery job
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-muted text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          Loading READY orders…
        </div>
      ) : pendingOrders.length === 0 ? (
        <div className="p-8 text-center text-muted text-sm">No READY delivery orders waiting for classification.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full text-sm min-w-[720px]">
            <thead>
              <tr>
                <th className="px-4 py-3 w-12">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-navy-border accent-brand"
                    aria-label="Select all READY orders"
                    title={`Select orders for one group (max ${maxCupsPerRider} cups)`}
                  />
                </th>
                <th className="px-4 py-3 whitespace-nowrap">Ordered</th>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 w-16">Cups</th>
                <th className="px-4 py-3 min-w-[11rem]">Items</th>
                <th className="px-4 py-3 w-24">Payment</th>
                <th className="px-4 py-3 w-16 text-center">Map</th>
              </tr>
            </thead>
            <tbody>
              {pageOrders.map((order) => {
                const cups = orderCupCount(order.items);
                const isSelected = Boolean(selection[order.orderId]);
                const addBlocked =
                  !isSelected && !canAddOrderToSelection(selection, cups, maxCupsPerRider).ok;
                const mapStop: DeliveryLocationStop = {
                  orderNumber: order.orderNumber,
                  addressLine: order.addressLine,
                  city: order.city,
                  district: order.district,
                  lat: order.lat,
                  lng: order.lng,
                };
                const canViewMap = hasDeliveryMapLocation(mapStop);

                return (
                  <tr
                    key={order.orderId}
                    className={isSelected ? 'admin-table__row--selected' : ''}
                  >
                    <td className="px-4 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={addBlocked}
                        onChange={(e) => toggleSelection(order, e.target.checked)}
                        className="h-4 w-4 rounded border-navy-border accent-brand disabled:opacity-40"
                        aria-label={`Select ${order.orderNumber} (${cups} cups)`}
                        title={
                          addBlocked
                            ? `Cannot add — max ${maxCupsPerRider} cups per group`
                            : `${cups} cup${cups === 1 ? '' : 's'}`
                        }
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-muted text-xs whitespace-nowrap tabular-nums">
                      {order.createdAt ? formatOrderedAt(order.createdAt) : '—'}
                    </td>
                    <td className="px-4 py-3 align-top admin-table__order-num whitespace-nowrap">
                      {order.orderNumber}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-fg font-medium">{order.customerName}</p>
                      {order.customerPhone && (
                        <p className="text-muted text-xs mt-0.5">{order.customerPhone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-muted font-semibold tabular-nums">{cups}</td>
                    <td className="px-4 py-3 align-top min-w-[11rem]">
                      <AdminOrderItemsCompact items={order.items} />
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <PaymentStatusBadge
                        paymentStatus={order.paymentStatus}
                        paymentMethod={order.paymentMethod}
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      {canViewMap ? (
                        <button
                          type="button"
                          onClick={() => setLocationModalStop(mapStop)}
                          className="admin-table__map-btn"
                          aria-label={`View map for ${order.orderNumber}`}
                          title="View location on map"
                        >
                          <Map size={18} />
                        </button>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && totalItems > 0 && (
        <div className="admin-table-pagination border-t border-navy-border pr-44 sm:pr-52">
          <p className="admin-table-pagination__summary text-xs text-muted">
            Showing <span className="text-fg font-semibold tabular-nums">{rangeStart}–{rangeEnd}</span> of{' '}
            <span className="text-fg font-semibold tabular-nums">{totalItems}</span> orders
          </p>
          <nav className="admin-table-pagination__nav" aria-label="Classification table pagination">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="admin-table-pagination__arrow"
              aria-label="Previous page"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="admin-table-pagination__pages">
              {pageList.map((item, i) =>
                item === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} className="admin-table-pagination__ellipsis" aria-hidden>
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    aria-label={`Page ${item}`}
                    aria-current={item === page ? 'page' : undefined}
                    className={`admin-table-pagination__page${item === page ? ' admin-table-pagination__page--active' : ''}`}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="admin-table-pagination__arrow"
              aria-label="Next page"
            >
              <ChevronRight size={20} />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
