'use client';

import { adminFetch } from '@/lib/adminApi';

import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Loader2,
  MapPin,
  Percent,
  XCircle,
} from 'lucide-react';
import { adminBadgeClass } from '@/lib/adminBadges';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';
import AdminComplaintDetailModal from '@/components/admin/AdminComplaintDetailModal';
import AdminBranchRequestReviewModal, {
  type AdminDriverBranchRequest,
  branchRequestCopy,
  branchRequestStatusLabel,
  branchRequestStatusVariant,
  branchRequestTypeLabel,
} from '@/components/admin/AdminBranchRequestReviewModal';
import AdminRiderKpiDetailModal from '@/components/admin/AdminRiderKpiDetailModal';
import { AnalyticsMetricCell, RiderAvatar } from '@/components/admin/deliveryAnalyticsUi';
import {
  type AdminDriverComplaint,
  complaintResolutionSummary,
  complaintStatusLabel,
  complaintStatusVariant,
} from '@/lib/complaints';
import { displayRideId, formatBranchName } from '@/lib/deliveryDisplay';
import { formatDateTime } from '@/lib/datetime';
import AdminReassignFailedOrderModal, {
  type AdminDeliveryFailure,
  forwardOrdersFromFailure,
} from '@/components/admin/AdminReassignFailedOrderModal';

type OpsPage<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

function toOpsPage<T>(data: unknown, page: number, pageSize: number): OpsPage<T> {
  if (data && typeof data === 'object' && Array.isArray((data as OpsPage<T>).rows)) {
    const pageData = data as OpsPage<T>;
    return {
      rows: pageData.rows,
      total: typeof pageData.total === 'number' ? pageData.total : pageData.rows.length,
      page: pageData.page ?? page,
      pageSize: pageData.pageSize ?? pageSize,
    };
  }
  if (Array.isArray(data)) {
    const rows = data as T[];
    const start = (page - 1) * pageSize;
    return {
      rows: rows.slice(start, start + pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  }
  return { rows: [], total: 0, page, pageSize };
}

function buildOpsListQuery(storeId: string | undefined, page: number, pageSize: number) {
  const qs = new URLSearchParams();
  if (storeId) qs.set('storeId', storeId);
  qs.set('page', String(page));
  qs.set('pageSize', String(pageSize));
  return `?${qs.toString()}`;
}

function buildOpsListQueryNoStore(page: number, pageSize: number) {
  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('pageSize', String(pageSize));
  return `?${qs.toString()}`;
}

export type AnalyticsFilters = {
  storeId?: string;
  driverId?: string;
  dateFrom?: string;
  dateTo?: string;
};

type RiderKpiRow = {
  riderId: string;
  riderName: string;
  attendanceDays: number;
  onlineTimeMinutes: number;
  jobCount: number;
  orderCount: number;
  totalDistanceKm: number;
};

type AnalyticsResponse = {
  summary: {
    acceptedRides: number;
    cancelledRides: number;
    cancelRate: number;
    completedRides: number;
    totalDistanceKm: number;
    averagePickupMinutes: number | null;
    averageDeliveryMinutes: number | null;
    averageTotalMinutes: number | null;
  };
  riders: {
    rows: RiderKpiRow[];
    total: number;
    page: number;
    pageSize: number;
  };
};

function buildAnalyticsQuery(filters: AnalyticsFilters, page: number, pageSize: number) {
  const qs = new URLSearchParams();
  if (filters.storeId) qs.set('storeId', filters.storeId);
  if (filters.driverId) qs.set('driverId', filters.driverId);
  if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) qs.set('dateTo', filters.dateTo);
  qs.set('page', String(page));
  qs.set('pageSize', String(pageSize));
  return `?${qs.toString()}`;
}

function formatMinutes(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toFixed(1)} min`;
}

function deliveryFailureOutcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'CUSTOMER_UNREACHABLE':
      return 'Customer not available';
    case 'WRONG_ADDRESS':
      return 'Wrong / incomplete address';
    case 'REFUSED':
      return 'Customer refused delivery';
    case 'PAYMENT_FAILED':
      return 'Payment issue';
    case 'OTHER':
      return 'Driver error';
    case 'VEHICLE_FAILURE':
      return 'Vehicle failure';
    default:
      return outcome.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

type Props = {
  storeId?: string;
  mode: 'complaints' | 'failures' | 'requests' | 'analytics';
  canReviewRequests?: boolean;
  analyticsFilters?: AnalyticsFilters;
  analyticsPage?: number;
  analyticsPageSize?: number;
  onAnalyticsPageChange?: (page: number) => void;
};

export default function AdminDriverOpsPanel({
  storeId,
  mode,
  canReviewRequests = false,
  analyticsFilters,
  analyticsPage = 1,
  analyticsPageSize = 20,
  onAnalyticsPageChange,
}: Props) {
  const qc = useQueryClient();
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [selectedFailure, setSelectedFailure] = useState<AdminDeliveryFailure | null>(null);
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [selectedBranchRequest, setSelectedBranchRequest] = useState<AdminDriverBranchRequest | null>(null);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(ADMIN_TABLE_PAGE_SIZE);

  useEffect(() => {
    setListPage(1);
  }, [storeId, mode]);

  const listQuery = buildOpsListQuery(storeId, listPage, listPageSize);
  const requestsListQuery = buildOpsListQueryNoStore(listPage, listPageSize);

  const appliedAnalyticsFilters: AnalyticsFilters = analyticsFilters ?? {
    storeId,
    driverId: '',
    dateFrom: '',
    dateTo: '',
  };

  const analyticsQueryString = buildAnalyticsQuery(
    {
      storeId: appliedAnalyticsFilters.storeId || undefined,
      driverId: appliedAnalyticsFilters.driverId || undefined,
      dateFrom: appliedAnalyticsFilters.dateFrom || undefined,
      dateTo: appliedAnalyticsFilters.dateTo || undefined,
    },
    analyticsPage,
    analyticsPageSize,
  );

  const complaintsQuery = useQuery({
    queryKey: ['admin-driver-complaints', storeId, listPage, listPageSize],
    queryFn: async () =>
      toOpsPage<AdminDriverComplaint>(
        (await adminFetch(`/admin/driver-complaints${listQuery}`)).data,
        listPage,
        listPageSize,
      ),
    enabled: mode === 'complaints',
    placeholderData: keepPreviousData,
  });

  const failuresQuery = useQuery({
    queryKey: ['admin-delivery-failures', storeId, listPage, listPageSize],
    queryFn: async () =>
      toOpsPage<AdminDeliveryFailure>(
        (await adminFetch(`/admin/delivery-failures${listQuery}`)).data,
        listPage,
        listPageSize,
      ),
    enabled: mode === 'failures',
    placeholderData: keepPreviousData,
  });

  const requestsQuery = useQuery({
    queryKey: ['admin-driver-branch-requests', listPage, listPageSize],
    queryFn: async () =>
      toOpsPage<AdminDriverBranchRequest>(
        (await adminFetch(`/admin/driver-branch-requests${requestsListQuery}`)).data,
        listPage,
        listPageSize,
      ),
    enabled: mode === 'requests',
    placeholderData: keepPreviousData,
  });

  const analyticsQuery = useQuery({
    queryKey: ['admin-driver-analytics', appliedAnalyticsFilters, analyticsPage, analyticsPageSize],
    queryFn: async () =>
      (await adminFetch(`/admin/driver-analytics${analyticsQueryString}`)).data as AnalyticsResponse,
    enabled: mode === 'analytics',
  });

  const reviewComplaint = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminFetch(`/admin/driver-complaints/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-driver-complaints'] });
      qc.invalidateQueries({ queryKey: ['admin-driver-complaint', vars.id] });
      toast.success('Complaint updated');
      setSelectedComplaintId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reviewRequest = useMutation({
    mutationFn: ({
      id,
      status,
      reviewNote,
    }: {
      id: string;
      status: 'APPROVED' | 'REJECTED';
      reviewNote?: string;
    }) =>
      adminFetch(`/admin/driver-branch-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reviewNote }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-driver-branch-requests'] });
      toast.success(vars.status === 'APPROVED' ? 'Request approved' : 'Request rejected');
      setSelectedBranchRequest(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function renderOpsTablePagination(
    pageData: OpsPage<unknown> | undefined,
    itemLabel: string,
    ariaLabel: string,
  ) {
    if (!pageData || pageData.total === 0) return null;
    const totalPages = Math.max(1, Math.ceil(pageData.total / listPageSize));
    const safePage = Math.min(listPage, totalPages);
    const rangeStart = (safePage - 1) * listPageSize + 1;
    const rangeEnd = Math.min(safePage * listPageSize, pageData.total);
    return (
      <div className="border-t border-navy-border px-4 py-3 sm:px-5">
        <AdminTablePagination
          pageSize={listPageSize}
          onPageSizeChange={(size) => {
            setListPageSize(size);
            setListPage(1);
          }}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          totalItems={pageData.total}
          safePage={safePage}
          totalPages={totalPages}
          pageList={buildPageList(safePage, totalPages)}
          onPageChange={setListPage}
          itemLabel={itemLabel}
          ariaLabel={ariaLabel}
        />
      </div>
    );
  }

  if (mode === 'analytics') {
    const summary = analyticsQuery.data?.summary;
    const riders = analyticsQuery.data?.riders;
    const totalPages = riders ? Math.max(1, Math.ceil(riders.total / riders.pageSize)) : 1;
    const cancelRateDisplay =
      summary != null ? `${Math.round((summary.cancelRate ?? 0) * 1000) / 10}%` : '—';
    const distanceDisplay =
      summary?.totalDistanceKm != null ? summary.totalDistanceKm.toFixed(1) : '—';
    const avgTotalDisplay =
      summary?.averageTotalMinutes != null ? summary.averageTotalMinutes.toFixed(1) : '—';

    return (
      <div className="space-y-7 sm:space-y-8">
        <section className="card overflow-hidden shadow-sm">
          <div className="border-b border-navy-border px-5 py-3.5 sm:px-6">
            <h2 className="text-sm font-semibold text-fg">Performance overview</h2>
            <p className="mt-0.5 text-xs text-muted">Summary metrics for the selected filters.</p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-navy-border/60 md:grid-cols-3 xl:grid-cols-6">
            <AnalyticsMetricCell
              icon={ClipboardCheck}
              label="Accepted"
              value={summary?.acceptedRides ?? '—'}
              tone="blue"
            />
            <AnalyticsMetricCell
              icon={XCircle}
              label="Cancelled"
              value={summary?.cancelledRides ?? '—'}
              tone="red"
            />
            <AnalyticsMetricCell
              icon={CheckCircle2}
              label="Completed"
              value={summary?.completedRides ?? '—'}
              tone="green"
            />
            <AnalyticsMetricCell
              icon={Percent}
              label="Cancel rate"
              value={cancelRateDisplay}
              tone="neutral"
            />
            <AnalyticsMetricCell
              icon={MapPin}
              label="Distance"
              value={distanceDisplay}
              unit="km"
              tone="blue"
            />
            <AnalyticsMetricCell
              icon={Clock}
              label="Average total time"
              value={avgTotalDisplay}
              unit="min"
              tone="neutral"
            />
          </div>
        </section>

        <section className="card overflow-hidden shadow-sm">
          <div className="flex flex-col gap-3 border-b border-navy-border px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div>
              <h2 className="text-base font-semibold text-fg">Rider KPI</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted">
                Click a rider row to view full KPI details and contributing jobs.
              </p>
            </div>
            {!analyticsQuery.isLoading && !analyticsQuery.isError && riders?.total != null && (
              <p className="shrink-0 text-sm font-medium text-muted">
                {riders.total.toLocaleString()} rider{riders.total === 1 ? '' : 's'}
              </p>
            )}
          </div>

          {analyticsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-12 text-muted">
              <Loader2 size={18} className="animate-spin" aria-hidden />
              <span>Loading rider KPI…</span>
            </div>
          ) : analyticsQuery.isError ? (
            <div className="px-5 py-12 text-center text-red-400">
              {(analyticsQuery.error as Error).message || 'Failed to load analytics.'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-navy-border bg-navy-light/40 text-left text-xs font-medium uppercase tracking-wide text-muted">
                      <th className="whitespace-nowrap px-5 py-3.5 sm:px-6">Rider</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-right sm:px-6">
                        Attendance days
                      </th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-right sm:px-6">Online time</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-right sm:px-6">Jobs</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-right sm:px-6">Orders</th>
                      <th className="whitespace-nowrap px-5 py-3.5 text-right sm:px-6">Total distance</th>
                      <th className="w-10 px-3 py-3.5" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {(riders?.rows ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-12 text-center text-muted sm:px-6">
                          No riders match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      (riders?.rows ?? []).map((row) => (
                        <tr
                          key={row.riderId}
                          tabIndex={0}
                          role="button"
                          aria-label={`View KPI details for ${row.riderName}`}
                          className="group cursor-pointer border-b border-navy-border transition-colors last:border-b-0 hover:bg-brand-subtle/40 focus-visible:bg-brand-subtle/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
                          onClick={() => setSelectedRiderId(row.riderId)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedRiderId(row.riderId);
                            }
                          }}
                        >
                          <td className="px-5 py-4 sm:px-6">
                            <div className="flex items-center gap-3">
                              <RiderAvatar name={row.riderName} seed={row.riderId} size="sm" />
                              <span className="font-medium text-fg">{row.riderName}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right tabular-nums text-fg sm:px-6">
                            {row.attendanceDays}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums text-fg sm:px-6">
                            {formatMinutes(row.onlineTimeMinutes)}
                          </td>
                          <td className="px-5 py-4 text-right tabular-nums text-fg sm:px-6">
                            {row.jobCount}
                          </td>
                          <td className="px-5 py-4 text-right tabular-nums text-fg sm:px-6">
                            {row.orderCount}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums text-fg sm:px-6">
                            {row.totalDistanceKm != null ? `${row.totalDistanceKm.toFixed(1)} km` : '—'}
                          </td>
                          <td className="px-3 py-4 text-muted transition-colors group-hover:text-brand">
                            <ChevronRight size={18} aria-hidden />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {riders && riders.total > riders.pageSize && (
                <div className="flex flex-col gap-3 border-t border-navy-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <p className="text-sm text-muted">
                    Page {riders.page} of {totalPages} · {riders.total.toLocaleString()} riders
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={analyticsPage <= 1}
                      onClick={() => onAnalyticsPageChange?.(Math.max(1, analyticsPage - 1))}
                      aria-label="Previous page"
                      className="btn-outline inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronLeft size={16} aria-hidden />
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={analyticsPage >= totalPages}
                      onClick={() => onAnalyticsPageChange?.(analyticsPage + 1)}
                      aria-label="Next page"
                      className="btn-outline inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                      <ChevronRight size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {selectedRiderId && (
          <AdminRiderKpiDetailModal
            riderId={selectedRiderId}
            filters={{
              storeId: appliedAnalyticsFilters.storeId || undefined,
              dateFrom: appliedAnalyticsFilters.dateFrom || undefined,
              dateTo: appliedAnalyticsFilters.dateTo || undefined,
            }}
            open={!!selectedRiderId}
            onClose={() => setSelectedRiderId(null)}
          />
        )}
      </div>
    );
  }

  if (mode === 'requests') {
    const requestPage = requestsQuery.data;
    const rows = requestPage?.rows ?? [];

    return (
      <>
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="whitespace-nowrap px-4 py-2">Driver</th>
                <th className="whitespace-nowrap px-4 py-2">Type</th>
                <th className="min-w-[12rem] px-4 py-2">Branch</th>
                <th className="min-w-[12rem] px-4 py-2">Reason</th>
                <th className="whitespace-nowrap px-4 py-2">Requested</th>
                <th className="whitespace-nowrap px-4 py-2">Status</th>
                <th className="whitespace-nowrap px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {requestsQuery.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      Loading branch requests…
                    </span>
                  </td>
                </tr>
              ) : requestsQuery.isError ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-red-400">
                    {(requestsQuery.error as Error).message || 'Failed to load branch requests.'}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No branch requests yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const copy = branchRequestCopy(row);
                  return (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-navy-border align-top hover:bg-navy-light/30"
                    onClick={() => setSelectedBranchRequest(row)}
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-white">{row.driver?.name ?? row.driverId}</td>
                    <td className="whitespace-nowrap px-4 py-2">{branchRequestTypeLabel(row.type)}</td>
                    <td className="px-4 py-2">
                      <p className="text-fg">{copy.summary}</p>
                      {copy.extra && <p className="text-xs text-muted">{copy.extra}</p>}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2" title={row.reason ?? undefined}>
                      {row.reason?.trim() || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">{formatDateTime(row.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <span className={adminBadgeClass(branchRequestStatusVariant(row.status))}>
                        {branchRequestStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-outline px-2 py-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBranchRequest(row);
                          }}
                        >
                          View
                        </button>
                        {canReviewRequests && row.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              className="btn-primary px-2 py-1 text-xs"
                              disabled={reviewRequest.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                reviewRequest.mutate({ id: row.id, status: 'APPROVED' });
                              }}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn-outline px-2 py-1 text-xs"
                              disabled={reviewRequest.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBranchRequest(row);
                              }}
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {renderOpsTablePagination(requestPage, 'requests', 'Branch requests pagination')}
        </div>
        <AdminBranchRequestReviewModal
          request={selectedBranchRequest}
          canReview={canReviewRequests}
          submitting={reviewRequest.isPending}
          onClose={() => setSelectedBranchRequest(null)}
          onReview={(status, reviewNote) => {
            if (!selectedBranchRequest) return;
            reviewRequest.mutate({ id: selectedBranchRequest.id, status, reviewNote });
          }}
        />
      </>
    );
  }

  if (mode === 'failures') {
    const failurePage = failuresQuery.data;
    const failures = failurePage?.rows ?? [];
    return (
      <>
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="px-4 py-2 whitespace-nowrap">Ride ID</th>
                <th className="px-4 py-2 whitespace-nowrap">Orders</th>
                <th className="px-4 py-2 whitespace-nowrap">Branch</th>
                <th className="px-4 py-2 whitespace-nowrap">Address</th>
                <th className="px-4 py-2 whitespace-nowrap">Driver</th>
                <th className="px-4 py-2 whitespace-nowrap">Outcome</th>
                <th className="px-4 py-2 min-w-[10rem]">Note</th>
                <th className="px-4 py-2 whitespace-nowrap">Status</th>
                <th className="px-4 py-2 whitespace-nowrap">Reported</th>
                <th className="px-4 py-2 whitespace-nowrap" />
              </tr>
            </thead>
            <tbody>
              {failures.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted">
                    No delivery failures for this branch.
                  </td>
                </tr>
              ) : (
                failures.map((row) => {
                  const address = [
                    row.order?.deliveryAddressLine,
                    row.order?.deliveryDistrict,
                    row.order?.deliveryCity,
                  ]
                    .filter(Boolean)
                    .join(', ');
                  const status = row.reassignmentStatus ?? 'needs_assignment';
                  const forward = forwardOrdersFromFailure(row);
                  return (
                    <tr key={row.id} className="border-t border-navy-border align-top">
                      <td className="px-4 py-2 text-white whitespace-nowrap font-medium">
                        {displayRideId(row.job?.rideCode, row.jobId)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <ul className="space-y-1">
                          {forward.map((stop) => (
                            <li key={stop.orderId} className="text-white">
                              #{stop.orderNumber}
                              {stop.isFailedStop && forward.length > 1 ? (
                                <span className="ml-1 text-[11px] text-muted">failed</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatBranchName(row.order?.store?.name ?? row.job?.store?.name)}
                      </td>
                      <td className="px-4 py-2 max-w-[14rem] text-muted">
                        <span className="line-clamp-2">{address || '—'}</span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{row.driver?.name ?? row.driverId}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {row.outcome === 'VEHICLE_FAILURE' ? (
                          <span className={adminBadgeClass('orange')}>{deliveryFailureOutcomeLabel(row.outcome)}</span>
                        ) : (
                          deliveryFailureOutcomeLabel(row.outcome)
                        )}
                      </td>
                      <td className="px-4 py-2 max-w-xs whitespace-pre-wrap break-words">{row.note || '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {status === 'ringing' ? (
                          <>
                            <span className={adminBadgeClass('orange')}>Ringing</span>
                            {row.activeRedeliveryJob?.driver?.name ? (
                              <p className="mt-1 text-[11px] text-muted">
                                {row.activeRedeliveryJob.driver.name}
                              </p>
                            ) : null}
                          </>
                        ) : status === 'assigned' ? (
                          <>
                            <span className={adminBadgeClass('yellow')}>Assigned</span>
                            {row.activeRedeliveryJob?.driver?.name ? (
                              <p className="mt-1 text-[11px] text-muted">
                                {row.activeRedeliveryJob.driver.name}
                                {row.activeRedeliveryJob.status
                                  ? ` · ${row.activeRedeliveryJob.status.replace(/_/g, ' ').toLowerCase()}`
                                  : ''}
                              </p>
                            ) : null}
                          </>
                        ) : status === 'done' ? (
                          <span className={adminBadgeClass('teal')}>Completed</span>
                        ) : status === 'not_reassignable' ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span className={adminBadgeClass('orange')}>Needs rider</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {row.canAssign ? (
                          <button
                            type="button"
                            className="btn-primary px-2 py-1 text-xs"
                            onClick={() => setSelectedFailure(row)}
                          >
                            Ring rider
                            {forward.length > 1 ? ` (${forward.length})` : ''}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {renderOpsTablePagination(failurePage, 'failures', 'Delivery failures pagination')}
        </div>
        <AdminReassignFailedOrderModal
          failure={selectedFailure}
          storeId={storeId}
          outcomeLabel={
            selectedFailure ? deliveryFailureOutcomeLabel(selectedFailure.outcome) : ''
          }
          onClose={() => setSelectedFailure(null)}
          onAssigned={() => {
            setSelectedFailure(null);
            qc.invalidateQueries({ queryKey: ['admin-delivery-failures'] });
            qc.invalidateQueries({ queryKey: ['admin-delivery-jobs'] });
          }}
        />
      </>
    );
  }

  const complaintPage = complaintsQuery.data;
  const complaints = complaintPage?.rows ?? [];

  return (
    <>
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="px-4 py-2 whitespace-nowrap">Complaint ID</th>
              <th className="px-4 py-2 whitespace-nowrap">Order #</th>
              <th className="px-4 py-2 whitespace-nowrap">Driver</th>
              <th className="px-4 py-2 whitespace-nowrap">Category</th>
              <th className="px-4 py-2 min-w-[12rem]">Description</th>
              <th className="px-4 py-2 whitespace-nowrap">Reported</th>
              <th className="px-4 py-2 whitespace-nowrap">Status</th>
              <th className="px-4 py-2 whitespace-nowrap" />
            </tr>
          </thead>
          <tbody>
            {complaints.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted">
                  No driver complaints for this branch.
                </td>
              </tr>
            ) : (
              complaints.map((row) => {
                const resolution = complaintResolutionSummary(row);
                return (
                  <tr
                    key={row.id}
                    className="border-t border-navy-border align-top cursor-pointer hover:bg-navy-light/30"
                    onClick={() => setSelectedComplaintId(row.id)}
                  >
                    <td className="px-4 py-2 text-white font-mono text-xs whitespace-nowrap" title={row.id}>
                      {row.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-2 text-white whitespace-nowrap">{row.order?.orderNumber ?? row.orderId}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{row.driver?.name ?? row.driverId}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{row.category}</td>
                    <td className="px-4 py-2 max-w-xs whitespace-pre-wrap break-words">{row.description}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className={adminBadgeClass(complaintStatusVariant(row.status))}>
                        {complaintStatusLabel(row.status)}
                      </span>
                      {row.status === 'OPEN' ? (
                        <p className="text-[11px] text-muted mt-1">Awaiting review</p>
                      ) : resolution ? (
                        <p className="text-[11px] text-muted mt-1 max-w-[10rem] truncate" title={resolution}>
                          {resolution}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-outline px-2 py-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedComplaintId(row.id);
                          }}
                        >
                          View
                        </button>
                        {row.status === 'OPEN' && (
                          <>
                            <button
                              type="button"
                              className="btn-primary px-2 py-1 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                reviewComplaint.mutate({ id: row.id, status: 'CONFIRMED' });
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="btn-outline px-2 py-1 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                reviewComplaint.mutate({ id: row.id, status: 'DISMISSED' });
                              }}
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {renderOpsTablePagination(complaintPage, 'complaints', 'Driver complaints pagination')}
      </div>

      <AdminComplaintDetailModal
        complaintId={selectedComplaintId}
        onClose={() => setSelectedComplaintId(null)}
        onReview={(status) => {
          if (!selectedComplaintId) return;
          reviewComplaint.mutate({ id: selectedComplaintId, status });
        }}
        isReviewing={reviewComplaint.isPending}
      />
    </>
  );
}
