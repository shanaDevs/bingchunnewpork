'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Loader2, Map, Route, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminDeliveryLocationModal, {
  hasDeliveryMapLocation,
  type DeliveryLocationStop,
} from '@/components/admin/AdminDeliveryLocationModal';
import AdminDeliveryRouteModal, {
  type PendingDeliveryJob,
} from '@/components/admin/AdminDeliveryRouteModal';
import { getAdminSession, isSuperAdmin, type AdminSession } from '@/lib/adminAuth';
import { adminBadgeClass, paymentStatusBadgeVariant } from '@/lib/adminBadges';
import type { DeliveryRoutePayload, DeliveryRouteStore } from '@/lib/deliveryRoute';
import { useMaxCupsPerRider } from '@/hooks/useMaxCupsPerRider';
import { isOrderPaid } from '@/lib/receipt';
import type { PaymentMethod } from '@/types';

type DeliveryStop = {
  orderId?: string;
  orderNumber: string;
  customerName: string;
  addressLine?: string;
  city?: string;
  district?: string;
  lat?: number;
  lng?: number;
  itemCount: number;
  paymentStatus?: string;
  paymentMethod?: string;
  sequence?: number;
};

type DeliveryBatch = {
  id: string;
  label: string;
  orderIds: string[];
  orders: DeliveryStop[];
  routePreview?: {
    summary: { stopCount: number; totalDistanceKm: number; estimatedMinutes: number };
    stops: DeliveryStop[];
    path: { lat: number; lng: number }[];
  };
};

type ClassifyResult = {
  store?: DeliveryRouteStore;
  pendingCount: number;
  unlocatedCount: number;
  maxCupsPerRider: number;
  totalCups: number;
  mode: 'manual' | 'directional';
  clusters: DeliveryBatch[];
};

type ClassifyOptions = {
  silent?: boolean;
};

type Props = {
  adminFetch: (endpoint: string, options?: RequestInit) => Promise<{ data?: unknown }>;
  /** When true, classify on mount and when store changes (modal open). */
  autoClassify?: boolean;
};

function PaymentStatusBadge({ paymentStatus, paymentMethod }: { paymentStatus: string; paymentMethod: string }) {
  const payment = {
    paymentStatus,
    paymentMethod: paymentMethod as PaymentMethod,
  };
  const paid = isOrderPaid(payment);
  const label = paid ? 'Paid' : paymentStatus === 'FAILED' ? 'Failed' : 'Unpaid';
  return (
    <span className={adminBadgeClass(paymentStatusBadgeVariant(payment))}>
      {label}
    </span>
  );
}

export default function AdminDeliveryClassificationPanel({ adminFetch, autoClassify = false }: Props) {
  const qc = useQueryClient();
  const maxCupsPerRider = useMaxCupsPerRider();
  const [mounted, setMounted] = useState(false);
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [storeId, setStoreId] = useState('');
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
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
    enabled: mounted && isSuperAdmin(admin),
  });

  useEffect(() => {
    if (isSuperAdmin(admin) && stores.length > 0 && !storeId) setStoreId(stores[0].id);
  }, [admin, stores, storeId]);

  const classify = useMutation({
    mutationFn: async (_opts?: ClassifyOptions) =>
      (await adminFetch('/admin/delivery/classify', {
        method: 'POST',
        body: JSON.stringify({ storeId: storeId || undefined, maxCupsPerRider }),
      })).data as ClassifyResult,
    onSuccess: (data, opts) => {
      setResult(data);
      setExpandedBatch(data.clusters[0]?.id ?? null);
      if (opts?.silent) return;
      if (data.clusters.length === 0) toast('No READY delivery orders to classify', { icon: 'ℹ️' });
      else toast.success(`${data.clusters.length} delivery run${data.clusters.length > 1 ? 's' : ''} ready`);
    },
    onError: (e: Error, opts) => {
      if (!opts?.silent) toast.error(e.message || 'Classification failed');
    },
  });

  useEffect(() => {
    if (!autoClassify || !mounted || !storeId) return;
    classify.mutate({ silent: true });
  }, [autoClassify, mounted, storeId]);

  const createJob = useMutation({
    mutationFn: ({ title, orderIds }: { batchId?: string; title: string; orderIds: string[] }) =>
      adminFetch('/admin/delivery-jobs', {
        method: 'POST',
        body: JSON.stringify({ storeId, title, orderIds }),
      }),
    onSuccess: (_data, { batchId }) => {
      qc.invalidateQueries({ queryKey: ['admin-delivery-jobs'] });
      qc.invalidateQueries({ queryKey: ['admin-delivery-jobs-active'] });
      qc.invalidateQueries({ queryKey: ['admin-delivery-jobs-completed'] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      qc.invalidateQueries({ queryKey: ['admin-orders-queue-counts'] });
      qc.invalidateQueries({ queryKey: ['admin-delivery-pending-orders'] });
      toast.success('Delivery job created');
      setRouteModalOpen(false);
      setPendingJob(null);
      if (batchId) {
        setResult((prev) =>
          prev ? { ...prev, clusters: prev.clusters.filter((c) => c.id !== batchId) } : prev
        );
        setExpandedBatch((cur) => (cur === batchId ? null : cur));
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create job'),
  });

  async function openRoutePreview(batch: DeliveryBatch) {
    setRouteModalOpen(true);
    setRouteModalLoading(true);
    setPendingJob({
      batchId: batch.id,
      title: batch.label,
      orderIds: batch.orderIds,
      route: {
        store: result?.store ?? { id: storeId, name: 'Branch', lat: 0, lng: 0, addressLine: '', city: '' },
        stops: [],
        path: [],
        summary: { stopCount: 0, totalDistanceKm: 0, estimatedMinutes: 0 },
      },
    });

    try {
      const preview = batch.routePreview;
      if (result?.store && preview?.path?.length && preview.stops.length > 0) {
        const route: DeliveryRoutePayload = {
          title: batch.label,
          store: result.store,
          stops: preview.stops as DeliveryRoutePayload['stops'],
          path: preview.path,
          summary: preview.summary,
        };
        setPendingJob({ batchId: batch.id, title: batch.label, orderIds: batch.orderIds, route });
        return;
      }

      const res = await adminFetch('/admin/delivery/preview-route', {
        method: 'POST',
        body: JSON.stringify({ storeId, orderIds: batch.orderIds, title: batch.label }),
      });
      const route = res.data as DeliveryRoutePayload;
      setPendingJob({ batchId: batch.id, title: batch.label, orderIds: batch.orderIds, route });
    } catch (e: unknown) {
      setRouteModalOpen(false);
      setPendingJob(null);
      toast.error(e instanceof Error ? e.message : 'Could not build route preview');
    } finally {
      setRouteModalLoading(false);
    }
  }

  function confirmCreateJob() {
    if (!pendingJob) return;
    createJob.mutate({
      batchId: pendingJob.batchId,
      title: pendingJob.title,
      orderIds: pendingJob.orderIds,
    });
  }

  if (!mounted || (!storeId && !isSuperAdmin(admin))) return null;

  const grandTotalCups = (result?.clusters ?? []).reduce((sum, batch) => {
    const stops = batch.routePreview?.stops ?? batch.orders;
    return sum + stops.reduce((n, s) => n + (s.itemCount ?? 0), 0);
  }, 0);

  return (
    <div className="space-y-4">
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-fg flex items-center gap-2 flex-wrap">
            <Route size={20} className="text-brand" />
            Delivery classification
            {result && result.clusters.length > 0 && (
              <span className="text-sm font-semibold text-brand bg-brand-subtle px-2.5 py-0.5 rounded-full tabular-nums">
                {grandTotalCups} cup{grandTotalCups === 1 ? '' : 's'} total
              </span>
            )}
          </h2>
          {/* <p className="text-muted text-xs mt-1">
            Group READY delivery orders into runs of {ORDERS_PER_DELIVERY}, optimise route, publish to drivers
          </p> */}
          {isSuperAdmin(admin) && stores.length > 0 && (
            <select
              value={storeId}
              onChange={(e) => { setStoreId(e.target.value); setResult(null); }}
              className="mt-3 bg-navy-light border border-navy-border rounded-lg px-3 py-2 text-white text-sm"
            >
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
        <button
          type="button"
          onClick={() => classify.mutate({ silent: false })}
          disabled={classify.isPending || !storeId}
          className="btn-primary px-4 py-2 text-sm flex items-center gap-2 shrink-0"
        >
          {classify.isPending ? <Loader2 size={15} className="animate-spin" /> : <Route size={15} />}
          {result ? 'Refresh' : 'Classify orders'}
        </button>
      </div>

      {classify.isPending && (
        <div className="py-6 text-center text-muted text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Building delivery runs…
        </div>
      )}

      {result?.clusters.length === 0 && !classify.isPending && (
        <p className="text-muted text-sm py-4 text-center">No READY delivery orders waiting for classification.</p>
      )}

      {result && result.clusters.length > 0 && !classify.isPending && (
        <p className="text-muted text-xs mb-3 px-1">
          {result.mode === 'manual'
            ? `Under 10 cups (${result.totalCups} total) — single list, customize the route manually.`
            : `${result.totalCups} cups — split into directional runs, max ${result.maxCupsPerRider ?? maxCupsPerRider} cups per rider.`}
        </p>
      )}

      <div className="space-y-2">
        {(result?.clusters ?? []).map((batch) => {
          const open = expandedBatch === batch.id;
          const summary = batch.routePreview?.summary;
          const stops = batch.routePreview?.stops ?? batch.orders.map((o, i) => ({ ...o, sequence: i + 1, itemCount: o.itemCount }));
          const totalCups = stops.reduce((sum, s) => sum + (s.itemCount ?? 0), 0);

          return (
            <div key={batch.id} className="border border-navy-border rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedBatch(open ? null : batch.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-navy-light/40 hover:bg-navy-light transition-colors text-left"
              >
                <div>
                  <p className="font-semibold text-fg text-sm">{batch.label}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {summary
                      ? `${summary.stopCount} stops · ${summary.totalDistanceKm.toFixed(1)} km · ~${summary.estimatedMinutes} min`
                      : `${stops.length} stops`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-brand bg-brand-subtle px-2.5 py-1 rounded-full tabular-nums">
                    {totalCups} cup{totalCups === 1 ? '' : 's'}
                  </span>
                  {open ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                </div>
              </button>

              {open && (
                <div className="border-t border-navy-border">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="border-b border-navy-border bg-navy-light/60 text-left text-muted text-xs uppercase tracking-wide">
                          <th className="px-4 py-2.5 font-semibold w-14">#</th>
                          <th className="px-4 py-2.5 font-semibold min-w-[140px]">Order</th>
                          <th className="px-4 py-2.5 font-semibold min-w-[120px]">Customer</th>
                          <th className="px-4 py-2.5 font-semibold w-20">Cups</th>
                          <th className="px-4 py-2.5 font-semibold w-24">Payment</th>
                          <th className="px-4 py-2.5 font-semibold w-24 text-center">Map</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stops.map((item, idx) => {
                          const canViewMap = hasDeliveryMapLocation(item);
                          return (
                            <tr
                              key={item.orderNumber}
                              className="border-b border-navy-border/60 last:border-0 hover:bg-navy-light/30 transition-colors"
                            >
                              <td className="px-4 py-3">
                                <span className="w-7 h-7 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">
                                  {item.sequence ?? idx + 1}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono font-semibold text-fg whitespace-nowrap">
                                {item.orderNumber}
                              </td>
                              <td className="px-4 py-3 text-fg whitespace-nowrap">
                                {item.customerName}
                              </td>
                              <td className="px-4 py-3 text-brand font-semibold tabular-nums whitespace-nowrap">
                                {item.itemCount ?? 0}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {item.paymentStatus && item.paymentMethod ? (
                                  <PaymentStatusBadge
                                    paymentStatus={item.paymentStatus}
                                    paymentMethod={item.paymentMethod}
                                  />
                                ) : (
                                  <span className="text-muted text-xs">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {canViewMap ? (
                                  <button
                                    type="button"
                                    onClick={() => setLocationModalStop(item)}
                                    className="admin-table__map-btn"
                                    aria-label={`View map for ${item.orderNumber}`}
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
                  <div className="px-4 py-3 border-t border-navy-border">
                  <button
                    type="button"
                    onClick={() => openRoutePreview(batch)}
                    disabled={createJob.isPending || routeModalLoading}
                    className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2"
                  >
                    {createJob.isPending || routeModalLoading ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Truck size={15} />
                    )}
                    Create delivery job
                  </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {result && result.clusters.length > 0 && (
        <p className="text-xs text-muted mt-4">
          Published jobs appear on the{' '}
          <Link href="/admin/delivery" className="text-brand hover:underline">Delivery jobs</Link> page.
        </p>
      )}
    </div>
  );
}
