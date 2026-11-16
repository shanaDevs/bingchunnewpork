'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

import { Fragment, useEffect, useState, type MouseEvent } from 'react';
import { Bell, ChevronLeft, ChevronRight, Loader2, MapPin, Route } from 'lucide-react';
import {
  adminBadgeClass,
  DELIVERY_JOB_STATUS_BADGE,
  DELIVERY_JOB_STATUS_LABEL,
  ORDER_STATUS_BADGE,
} from '@/lib/adminBadges';
import { formatBranchName, shortJobId } from '@/lib/deliveryDisplay';
import { getStatusLabel } from '@/lib/orderStatus';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';
import type { OrderStatus } from '@/types';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import AdminDeliveryLocationModal, {
  hasDeliveryMapLocation,
  type DeliveryLocationStop,
} from '@/components/admin/AdminDeliveryLocationModal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDeliveryJobTitle } from '@/lib/deliveryRoute';
import { jobLikelyHasRiderGps } from '@/lib/deliveryStopProgress';

export type DeliveryJobListItem = {
  id: string;
  rideCode?: string | null;
  title: string;
  status: string;
  orderCount: number;
  deliveredCount?: number;
  totalCups?: number | null;
  totalRevenue?: number;
  totalDistanceKm?: number | null;
  estimatedDistanceKm?: number | null;
  estimatedMinutes?: number | null;
  actualDistanceKm?: number | null;
  actualMinutes?: number | null;
  totalDeliveryFees?: number | null;
  hasActualRoute?: boolean;
  createdAt?: string;
  /** Computed sub-status for a past-due job that never completed (Missed/Abandoned/Partially Completed/Cancelled). */
  displayStatus?: string | null;
  scheduledAt: string;
  completedAt?: string | null;
  storeName?: string;
  storeId?: string;
  driver?: { id?: string; name: string } | null;
};

export type JobFilters = {
  storeId: string;
  driverId: string;
  dateFrom: string;
  dateTo: string;
};

/** @deprecated Use JobFilters */
export type CompletedJobFilters = JobFilters;

type JobOrderItem = {
  productName: string;
  quantity: number;
  totalPrice: number;
  imageUrl?: string | null;
};

type JobOrder = {
  orderId: string;
  orderNumber: string;
  sequence: number;
  status: string;
  customerName: string;
  customerPhone: string;
  addressLine: string;
  city: string;
  lat?: number | null;
  lng?: number | null;
  total?: number | null;
  items: JobOrderItem[];
};

function orderLocationStop(order: JobOrder): DeliveryLocationStop {
  return {
    orderNumber: order.orderNumber,
    addressLine: order.addressLine,
    city: order.city,
    lat: order.lat,
    lng: order.lng,
  };
}

type DeliveryJobDetail = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string;
  completedAt?: string | null;
  orderCount: number;
  deliveredCount: number;
  store: { name: string };
  driver?: { name: string } | null;
  orders: JobOrder[];
};

const JOB_STATUS_BADGE = DELIVERY_JOB_STATUS_BADGE;

function formatJobStatusLabel(status: string): string {
  return DELIVERY_JOB_STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

async function fetchJobDetail(jobId: string, storeId: string): Promise<DeliveryJobDetail> {
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  const res = await fetch(
    `${getApiBaseUrl()}/admin/delivery-jobs/${encodeURIComponent(jobId)}${qs}`,
    { headers: adminAuthHeaders() },
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Job not found');
  return json.data as DeliveryJobDetail;
}

function formatScheduleDate(value: string) {
  return new Date(value).toLocaleString('en-LK', { dateStyle: 'short', timeStyle: 'short' });
}

const RE_RING_VISIBLE_AFTER_MS = 30_000;
const RE_RING_COOLDOWN_MS = 30_000;

/** Re-notify branch drivers about a job still sitting unclaimed 30s+ after creation. */
function ReRingButton({ job }: { job: DeliveryJobListItem }) {
  const [now, setNow] = useState(() => Date.now());
  const [lastRungAt, setLastRungAt] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const isUnclaimed = job.status === 'SCHEDULED' && !job.driver;
  const createdAtMs = job.createdAt ? new Date(job.createdAt).getTime() : null;
  const eligible = isUnclaimed && createdAtMs != null && now - createdAtMs >= RE_RING_VISIBLE_AFTER_MS;

  if (!eligible) return null;

  const cooldownRemainingMs = lastRungAt != null ? RE_RING_COOLDOWN_MS - (now - lastRungAt) : 0;
  const coolingDown = cooldownRemainingMs > 0;
  const secondsLeft = Math.max(1, Math.ceil(cooldownRemainingMs / 1000));

  async function handleReRing(e: MouseEvent) {
    e.stopPropagation();
    if (sending || coolingDown) return;
    setSending(true);
    setErrorMsg(null);
    try {
            const res = await fetch(`${getApiBaseUrl()}/admin/delivery-jobs/${encodeURIComponent(job.id)}/re-ring`, {
        method: 'POST',
        headers: adminAuthHeaders(),
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Could not re-ring drivers');
      setLastRungAt(Date.now());
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not re-ring drivers');
    } finally {
      setSending(false);
    }
  }

  const label = sending
    ? 'Re-ringing…'
    : coolingDown
      ? `Rung — again in ${secondsLeft}s`
      : errorMsg
        ? 'Retry re-ring'
        : 'Re-ring driver';

  return (
    <button
      type="button"
      onClick={handleReRing}
      disabled={sending || coolingDown}
      title={errorMsg ?? undefined}
      className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-400 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
    >
      <Bell size={16} aria-hidden strokeWidth={2.5} />
      {label}
    </button>
  );
}

function formatAmount(amount?: number | null): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return amount.toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDistance(km?: number | null): string {
  if (km == null) return '—';
  return `${km.toFixed(1)} km`;
}

function formatItemsCompact(items?: JobOrderItem[]) {
  if (!items?.length) return '—';
  return items.map((item) => `${item.productName} ×${item.quantity}`).join(', ');
}

function JobOrdersPanel({
  jobId,
  storeId,
  showOrderStatus = true,
  hideCancelled = false,
}: {
  jobId: string;
  storeId: string;
  showOrderStatus?: boolean;
  hideCancelled?: boolean;
}) {
  const [job, setJob] = useState<DeliveryJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationModalStop, setLocationModalStop] = useState<DeliveryLocationStop | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchJobDetail(jobId, storeId)
      .then((data) => {
        if (!cancelled) setJob(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load job');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, storeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-muted text-xs">
        <Loader2 size={14} className="animate-spin" /> Loading orders…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-3 my-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        {error}
      </div>
    );
  }

  if (!job) return null;

  const orders = hideCancelled
    ? job.orders.filter((order) => order.status !== 'CANCELLED')
    : job.orders;

  return (
    <>
      <AdminDeliveryLocationModal stop={locationModalStop} onClose={() => setLocationModalStop(null)} />
      <div className="admin-table__nested overflow-x-auto bg-[#f8fafc]/50 rounded-b-xl border-x border-b border-slate-200/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] p-2 sm:p-4">
        <Table
          className={`admin-table--nested w-full text-xs bg-white rounded-lg overflow-hidden border border-slate-100 shadow-sm ${showOrderStatus ? 'min-w-[720px]' : 'min-w-[640px]'}`}
        >
          <TableHeader className="bg-[#f0f4f8] border-b border-slate-200/80">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 text-slate-600 font-semibold h-9">#</TableHead>
              <TableHead className="min-w-[100px] text-slate-600 font-semibold h-9">Order</TableHead>
              <TableHead className="min-w-[100px] text-slate-600 font-semibold h-9">Customer</TableHead>
              <TableHead className="min-w-[96px] text-slate-600 font-semibold h-9">Mobile</TableHead>
              <TableHead className="w-24 text-slate-600 font-semibold h-9">Location</TableHead>
              <TableHead className="min-w-[160px] text-slate-600 font-semibold h-9">Items</TableHead>
              <TableHead className="w-20 text-right text-slate-600 font-semibold h-9">Total (LKR)</TableHead>
              {showOrderStatus && <TableHead className="w-28 text-slate-600 font-semibold h-9">Status</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.orderId} className="align-top hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                <TableCell className="py-2.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-medium text-slate-600 shadow-sm">{order.sequence}</span>
                </TableCell>
                <TableCell className="admin-table__order-num whitespace-nowrap font-medium text-slate-800 py-2.5">{order.orderNumber}</TableCell>
                <TableCell className="text-slate-700 font-medium py-2.5">{order.customerName || '—'}</TableCell>
                <TableCell className="text-slate-500 whitespace-nowrap py-2.5">{order.customerPhone || '—'}</TableCell>
                <TableCell className="whitespace-nowrap py-2.5">
                  {(() => {
                    const stop = orderLocationStop(order);
                    if (!hasDeliveryMapLocation(stop)) {
                      return <span className="text-slate-400">—</span>;
                    }
                    return (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocationModalStop(stop);
                        }}
                        className="inline-flex items-center gap-1.5 text-orange-500 hover:text-orange-600 transition-colors font-medium text-[11px] uppercase tracking-wide"
                        aria-label={`View map for ${order.orderNumber}`}
                        title={[order.addressLine, order.city].filter(Boolean).join(', ')}
                      >
                        <MapPin size={13} aria-hidden strokeWidth={2.5} />
                        View map
                      </button>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-slate-500 max-w-[220px] py-2.5">
                  <span className="line-clamp-2 leading-relaxed" title={formatItemsCompact(order.items)}>
                    {formatItemsCompact(order.items)}
                  </span>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap font-semibold text-slate-900 py-2.5">
                  {formatAmount(order.total)}
                </TableCell>
                {showOrderStatus && (
                  <TableCell className="whitespace-nowrap">
                    <span className={adminBadgeClass(ORDER_STATUS_BADGE[order.status] ?? 'neutral')}>
                      {getStatusLabel(order.status as OrderStatus, 'DELIVERY')}
                    </span>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

type Props = {
  jobs: DeliveryJobListItem[];
  storeId: string;
  variant: 'active' | 'completed' | 'incomplete';
  emptyMessage: string;
  showFilters?: boolean;
  filters?: CompletedJobFilters;
  onFiltersChange?: (filters: CompletedJobFilters) => void;
  stores?: { id: string; name: string }[];
  drivers?: { id: string; name: string; store?: { name: string } | null }[];
  onViewRoute?: (job: {
    jobId: string;
    storeId: string;
    initialStatus?: string;
    forceReplay?: boolean;
    displayStatus?: string | null;
  }) => void;
  onViewActualRoute?: (job: { jobId: string; storeId: string }) => void;
  onRowClick?: (job: DeliveryJobListItem) => void;
};

export default function AdminDeliveryJobsTable({
  jobs,
  storeId,
  variant,
  emptyMessage,
  showFilters = false,
  filters,
  onFiltersChange,
  stores = [],
  drivers = [],
  onViewRoute,
  onViewActualRoute,
  onRowClick,
}: Props) {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const isCompleted = variant === 'completed';
  const totalItems = jobs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ADMIN_TABLE_PAGE_SIZE));
  const pageList = buildPageList(page, totalPages);
  const rangeStart = totalItems === 0 ? 0 : (page - 1) * ADMIN_TABLE_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * ADMIN_TABLE_PAGE_SIZE, totalItems);
  const pageJobs = jobs.slice((page - 1) * ADMIN_TABLE_PAGE_SIZE, page * ADMIN_TABLE_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
    setExpandedJobId(null);
  }, [jobs]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setExpandedJobId(null);
  }, [page]);

  const filterBar =
    showFilters && filters && onFiltersChange ? (
      <div className="border-b border-navy-border px-4 py-4 sm:px-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-muted mb-1">Branch</label>
          <SearchableBranchSelect
            stores={stores}
            value={filters.storeId || undefined}
            onChange={(storeId) => onFiltersChange({ ...filters, storeId })}
            formatName={formatBranchName}
            placeholder="All branches"
            className="min-w-[160px] h-[38px]"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Rider</label>
          <select
            value={filters.driverId}
            onChange={(e) => onFiltersChange({ ...filters, driverId: e.target.value })}
            className="bg-navy-light border border-navy-border rounded-lg px-3 py-2 text-white text-sm min-w-[160px] h-[38px]"
          >
            <option value="">All riders</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.store?.name ? `${d.name} · ${d.store.name}` : d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">From</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
            className="bg-navy-light border border-navy-border rounded-lg px-3 py-2 text-white text-sm h-[38px]"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">To</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
            className="bg-navy-light border border-navy-border rounded-lg px-3 py-2 text-white text-sm h-[38px]"
          />
        </div>
        {(filters.storeId || filters.driverId || filters.dateFrom || filters.dateTo) ? (
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => onFiltersChange({ storeId: '', driverId: '', dateFrom: '', dateTo: '' })}
              className="text-sm text-white bg-navy-light border border-navy-border rounded-lg px-4 py-2 hover:bg-navy transition-colors h-[38px] flex items-center"
            >
              Reset
            </button>
          </div>
        ) : null}
      </div>
    ) : null;

  if (jobs.length === 0) {
    return (
      <>
        {filterBar}
        <div className="p-8 text-center text-muted text-sm">{emptyMessage}</div>
      </>
    );
  }

  const paginationLabel = isCompleted ? 'Completed schedules pagination' : 'Active schedules pagination';
  const completedColSpan = 9;

  return (
    <>
      {filterBar}
      <div className="overflow-x-auto rounded-xl border border-slate-200/60 shadow-sm bg-white">
        <Table className={`w-full text-sm ${isCompleted ? 'min-w-[1400px]' : 'min-w-[980px]'}`}>
          <TableHeader className="bg-[#f0f4f8]">
            <TableRow className="hover:bg-transparent border-b border-slate-200/80">
              <TableHead className="w-10 h-11" aria-hidden />
              {isCompleted ? (
                <>
                  <TableHead className="min-w-[130px] whitespace-nowrap text-slate-600 font-semibold h-11">Schedule time</TableHead>
                  <TableHead className="min-w-[130px] whitespace-nowrap text-slate-600 font-semibold h-11">Complete time</TableHead>
                  <TableHead className="w-28 text-slate-600 font-semibold h-11">Ride ID</TableHead>
                  <TableHead className="w-16 text-slate-600 font-semibold h-11">Orders</TableHead>
                  <TableHead className="w-14 text-slate-600 font-semibold h-11">Cups</TableHead>
                  <TableHead className="w-24 text-slate-600 font-semibold h-11">Est. km</TableHead>
                  <TableHead className="w-24 text-slate-600 font-semibold h-11">Actual km</TableHead>
                  <TableHead className="w-20 text-slate-600 font-semibold h-11">Est. min</TableHead>
                  <TableHead className="w-20 text-slate-600 font-semibold h-11">Actual min</TableHead>
                  <TableHead className="w-28 text-slate-600 font-semibold h-11">Route</TableHead>
                  <TableHead className="min-w-[120px] text-slate-600 font-semibold h-11">Branch</TableHead>
                  <TableHead className="min-w-[120px] text-slate-600 font-semibold h-11">Driver</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="min-w-[180px] text-slate-600 font-semibold h-11">Schedule</TableHead>
                  <TableHead className="w-32 text-slate-600 font-semibold h-11">Job status</TableHead>
                  <TableHead className="w-24 text-slate-600 font-semibold h-11">Orders</TableHead>
                  <TableHead className="w-24 text-slate-600 font-semibold h-11">Map</TableHead>
                  <TableHead className="min-w-[120px] text-slate-600 font-semibold h-11">Branch</TableHead>
                  <TableHead className="min-w-[120px] text-slate-600 font-semibold h-11">Driver</TableHead>
                  <TableHead className="min-w-[140px] whitespace-nowrap text-slate-600 font-semibold h-11">Scheduled at</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageJobs.map((job) => {
              const open = expandedJobId === job.id;
              const jobStoreId = job.storeId ?? storeId;

              return (
                <Fragment key={job.id}>
                  <TableRow
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => {
                      if (onRowClick) {
                        onRowClick(job);
                        return;
                      }
                      setExpandedJobId(open ? null : job.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (onRowClick) {
                          onRowClick(job);
                          return;
                        }
                        setExpandedJobId(open ? null : job.id);
                      }
                    }}
                    className={`cursor-pointer transition-colors duration-200 ${open ? 'bg-[#f8fafc]' : 'bg-white hover:bg-slate-50/70'} border-b border-slate-100`}
                  >
                    <TableCell className="py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedJobId(open ? null : job.id);
                        }}
                        className="inline-flex items-center justify-center rounded-md p-0.5 text-slate-400 hover:text-brand"
                        aria-label={open ? 'Collapse job orders' : 'Expand job orders'}
                      >
                        <ChevronRight
                          size={18}
                          className={`transition-transform duration-300 ${open ? 'rotate-90 text-brand' : ''}`}
                          aria-hidden
                        />
                      </button>
                    </TableCell>
                    {isCompleted ? (
                      <>
                        <TableCell className="text-slate-500 text-xs whitespace-nowrap tabular-nums py-3 font-medium">
                          {formatScheduleDate(job.scheduledAt)}
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs whitespace-nowrap tabular-nums py-3 font-medium">
                          {job.completedAt ? formatScheduleDate(job.completedAt) : '—'}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="font-mono text-xs text-blue-600 font-semibold">
                            {job.rideCode ?? shortJobId(job.id)}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums text-slate-900 font-bold py-3">
                          {job.orderCount}
                        </TableCell>
                        <TableCell className="tabular-nums text-slate-700 font-medium py-3">
                          {job.totalCups ?? '—'}
                        </TableCell>
                        <TableCell className="text-slate-600 text-xs whitespace-nowrap tabular-nums py-3 font-medium">
                          {formatDistance(job.estimatedDistanceKm ?? job.totalDistanceKm)}
                        </TableCell>
                        <TableCell className="text-slate-600 text-xs whitespace-nowrap tabular-nums py-3 font-medium">
                          {formatDistance(job.actualDistanceKm)}
                        </TableCell>
                        <TableCell className="text-slate-600 text-xs whitespace-nowrap tabular-nums py-3 font-medium">
                          {job.estimatedMinutes != null ? `${job.estimatedMinutes}m` : '—'}
                        </TableCell>
                        <TableCell className="text-slate-600 text-xs whitespace-nowrap tabular-nums py-3 font-medium">
                          {job.actualMinutes != null ? `${job.actualMinutes}m` : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3">
                          <div className="flex flex-row items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewRoute?.({
                                  jobId: job.id,
                                  storeId: jobStoreId,
                                  initialStatus: job.status,
                                });
                              }}
                              className="inline-flex items-center gap-1.5 text-orange-500 hover:text-orange-600 transition-colors font-medium text-[11px] uppercase tracking-wide"
                            >
                              <Route size={13} aria-hidden strokeWidth={2.5} />
                              Planned
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewActualRoute?.({ jobId: job.id, storeId: jobStoreId });
                              }}
                              className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 transition-colors font-medium text-[11px] uppercase tracking-wide"
                            >
                              <MapPin size={13} aria-hidden strokeWidth={2.5} />
                              Actual
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-700 font-medium py-3">{job.storeName ?? '—'}</TableCell>
                        <TableCell className="text-slate-700 font-medium py-3">
                          {job.driver?.name ?? <span className="text-slate-400 italic font-normal">Unassigned</span>}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="py-3">
                          <p className="font-semibold text-slate-800 leading-snug">{formatDeliveryJobTitle(job.title)}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3">
                          <span
                            className={adminBadgeClass(
                              JOB_STATUS_BADGE[job.displayStatus ?? job.status] ?? 'neutral',
                            )}
                          >
                            {formatJobStatusLabel(job.displayStatus ?? job.status)}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums text-slate-900 font-bold py-3">
                          {job.orderCount}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3">
                          <div className="flex flex-col items-start gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewRoute?.({
                                  jobId: job.id,
                                  storeId: jobStoreId,
                                  initialStatus: job.status,
                                  forceReplay: variant === 'incomplete',
                                  displayStatus: job.displayStatus,
                                });
                              }}
                              className="inline-flex items-center gap-1.5 text-orange-500 hover:text-orange-600 transition-colors font-medium text-[11px] uppercase tracking-wide"
                            >
                              <Route size={13} aria-hidden strokeWidth={2.5} />
                              View route
                            </button>
                            {variant === 'incomplete' && jobLikelyHasRiderGps(job) ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewActualRoute?.({ jobId: job.id, storeId: jobStoreId });
                                }}
                                className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 transition-colors font-medium text-[11px] uppercase tracking-wide"
                              >
                                <MapPin size={13} aria-hidden strokeWidth={2.5} />
                                Actual
                              </button>
                            ) : null}
                            <ReRingButton job={job} />
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-700 font-medium py-3">{job.storeName ?? '—'}</TableCell>
                        <TableCell className="text-slate-700 font-medium py-3">
                          {job.driver?.name ?? <span className="text-slate-400 italic font-normal">Unassigned</span>}
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs whitespace-nowrap tabular-nums py-3 font-medium">
                          {formatScheduleDate(job.scheduledAt)}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                  {open && (
                    <TableRow className="bg-[#f8fafc] border-b border-slate-200/60">
                      <TableCell colSpan={isCompleted ? completedColSpan : 8} className="p-0 sm:p-2 sm:px-4 hover:bg-transparent border-0">
                        <JobOrdersPanel
                          jobId={job.id}
                          storeId={jobStoreId}
                          showOrderStatus={!isCompleted}
                          hideCancelled={!isCompleted}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="admin-table-pagination border-t border-navy-border">
        <p className="admin-table-pagination__summary text-xs text-muted">
          Showing <span className="text-fg font-semibold tabular-nums">{rangeStart}–{rangeEnd}</span> of{' '}
          <span className="text-fg font-semibold tabular-nums">{totalItems}</span> schedules
        </p>
        <nav className="admin-table-pagination__nav" aria-label={paginationLabel}>
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
    </>
  );
}
