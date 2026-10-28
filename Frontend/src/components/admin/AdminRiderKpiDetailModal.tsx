'use client';

import { adminAuthHeaders } from '@/lib/adminSession';

import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  Ban,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ClipboardList,
  Gauge,
  ListOrdered,
  Loader2,
  MapPin,
  Package,
  Timer,
  UserCheck,
  Wifi,
  X,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBase';
import { adminBadgeClass, DELIVERY_JOB_STATUS_LABEL, type AdminBadgeVariant } from '@/lib/adminBadges';
import { formatDate, formatDurationMinutes, formatTime } from '@/lib/datetime';
import type { AnalyticsFilters } from '@/components/admin/AdminDriverOpsPanel';
import { RiderAvatar, RiderDetailKpiItem } from '@/components/admin/deliveryAnalyticsUi';

async function adminFetch(endpoint: string) {
    const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json;
}

const JOB_STATUS_BADGE: Record<string, AdminBadgeVariant> = {
  SCHEDULED: 'blue',
  ASSIGNED: 'yellow',
  QUEUED: 'purple',
  IN_PROGRESS: 'orange',
  RETURNING: 'orange',
  COMPLETED: 'green',
  CANCELLED: 'red',
  VEHICLE_FAILURE: 'red',
};

const DUTY_STATUS_LABEL: Record<string, string> = {
  ONLINE: 'Online',
  ON_DELIVERY: 'On delivery',
  OFF_DUTY: 'Off duty',
};

const DUTY_STATUS_BADGE: Record<string, AdminBadgeVariant> = {
  ONLINE: 'green',
  ON_DELIVERY: 'orange',
  OFF_DUTY: 'neutral',
};

type JobRow = {
  id: string;
  date: string | null;
  status: string;
  orderCount: number;
  distanceKm: number | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  cancellationReason: string | null;
};

type RiderKpiDetailResponse = {
  rider: {
    id: string;
    name: string;
    branch: string | null;
    dutyStatus: string;
  };
  period: { dateFrom: string | null; dateTo: string | null };
  kpi: {
    attendanceDays: number;
    onlineTimeMinutes: number;
    totalJobs: number;
    completedJobs: number;
    cancelledJobs: number;
    rejectedJobs: number;
    totalOrders: number;
    totalDistanceKm: number;
    totalDeliveryTimeMinutes: number;
    averageTimePerOrderMinutes: number | null;
    averageStationTimeMinutes: number | null;
  };
  jobs: {
    rows: JobRow[];
    total: number;
    page: number;
    pageSize: number;
  };
};

type Props = {
  riderId: string;
  filters: AnalyticsFilters;
  open: boolean;
  onClose: () => void;
};

function buildDetailQuery(filters: AnalyticsFilters, jobsPage: number, jobsPageSize: number) {
  const qs = new URLSearchParams();
  if (filters.storeId) qs.set('storeId', filters.storeId);
  if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) qs.set('dateTo', filters.dateTo);
  qs.set('jobsPage', String(jobsPage));
  qs.set('jobsPageSize', String(jobsPageSize));
  return `?${qs.toString()}`;
}

function formatDistance(km: number | null | undefined): string {
  if (km == null) return '—';
  return `${km.toFixed(1)} km`;
}

function formatPeriod(dateFrom?: string | null, dateTo?: string | null): string {
  if (!dateFrom && !dateTo) return 'All dates';
  if (dateFrom && dateTo) return `${dateFrom} → ${dateTo}`;
  if (dateFrom) return `From ${dateFrom}`;
  return `Until ${dateTo}`;
}

function shortJobId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function formatTimestampCell(value: string | null): string {
  return value ? formatTime(value) : '—';
}

function MetricCategoryPanel({
  title,
  icon: Icon,
  children,
  twoColumn = false,
  className = '',
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  twoColumn?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 dark:border-navy-border dark:bg-navy-light/20 sm:p-5 ${className}`}
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand dark:bg-brand/15 dark:text-brand-light">
          <Icon size={16} strokeWidth={2.25} aria-hidden />
        </div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-fg">{title}</h4>
      </div>
      <div className={twoColumn ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : 'space-y-4'}>
        {children}
      </div>
    </div>
  );
}

function JobsPagination({
  jobsPage,
  totalJobPages,
  onPrevious,
  onNext,
}: {
  jobsPage: number;
  totalJobPages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-navy-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-sm text-muted">
        Page {jobsPage} of {totalJobPages}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={jobsPage <= 1}
          onClick={onPrevious}
          aria-label="Previous page"
          className="btn-outline inline-flex items-center gap-1.5 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft size={16} aria-hidden />
          Previous
        </button>
        <span className="px-2 text-sm tabular-nums text-muted" aria-live="polite">
          {jobsPage} / {totalJobPages}
        </span>
        <button
          type="button"
          disabled={jobsPage >= totalJobPages}
          onClick={onNext}
          aria-label="Next page"
          className="btn-outline inline-flex items-center gap-1.5 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function JobCard({ row }: { row: JobRow }) {
  return (
    <article className="rounded-xl border border-navy-border bg-white p-4 shadow-sm dark:bg-navy-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold tabular-nums text-fg">{shortJobId(row.id)}</p>
          <p className="mt-0.5 text-[13px] text-muted">{row.date ? formatDate(row.date) : '—'}</p>
        </div>
        <span className={adminBadgeClass(JOB_STATUS_BADGE[row.status] ?? 'neutral')}>
          {DELIVERY_JOB_STATUS_LABEL[row.status] ?? row.status.replace(/_/g, ' ')}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-muted">Orders</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-fg">{row.orderCount}</dd>
        </div>
        <div>
          <dt className="text-muted">Distance</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-fg">{formatDistance(row.distanceKm)}</dd>
        </div>
        <div>
          <dt className="text-muted">Assigned</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-fg">
            {formatTimestampCell(row.assignedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Started</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-fg">
            {formatTimestampCell(row.startedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Completed</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-fg">
            {formatTimestampCell(row.completedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Duration</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-fg">
            {formatDurationMinutes(row.durationMinutes)}
          </dd>
        </div>
      </dl>
      {row.cancellationReason ? (
        <div className="mt-4 border-t border-navy-border/70 pt-3">
          <p className="text-sm text-muted">Cancellation reason</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg">
            {row.cancellationReason}
          </p>
        </div>
      ) : null}
    </article>
  );
}

function JobsTable({ rows }: { rows: JobRow[] }) {
  return (
    <table className="w-full table-fixed text-sm">
      <colgroup>
        <col style={{ width: '14%' }} />
        <col style={{ width: '11%' }} />
        <col style={{ width: '7%' }} />
        <col style={{ width: '9%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: '21%' }} />
      </colgroup>
      <thead className="sticky top-0 z-[1] bg-slate-100/95 dark:bg-slate-800/60">
        <tr className="border-b border-navy-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
          <th className="px-4 py-3 sm:px-4">Job</th>
          <th className="px-4 py-3 sm:px-4">Status</th>
          <th className="px-4 py-3 text-right sm:px-4">Orders</th>
          <th className="px-4 py-3 text-right sm:px-4">Distance</th>
          <th className="px-4 py-3 sm:px-4">Assigned</th>
          <th className="px-4 py-3 sm:px-4">Started</th>
          <th className="px-4 py-3 sm:px-4">Completed</th>
          <th className="px-4 py-3 text-right sm:px-4">Duration</th>
          <th className="px-4 py-3 sm:px-4">Cancellation reason</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className="border-b border-navy-border/60 align-middle transition-colors last:border-b-0 hover:bg-brand-subtle/30"
          >
            <td className="px-4 py-3.5 sm:px-4">
              <p className="truncate text-[15px] font-semibold tabular-nums text-fg">
                {shortJobId(row.id)}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {row.date ? formatDate(row.date) : '—'}
              </p>
            </td>
            <td className="px-4 py-3.5 sm:px-4">
              <span className={adminBadgeClass(JOB_STATUS_BADGE[row.status] ?? 'neutral')}>
                {DELIVERY_JOB_STATUS_LABEL[row.status] ?? row.status.replace(/_/g, ' ')}
              </span>
            </td>
            <td className="px-4 py-3.5 text-right tabular-nums text-fg sm:px-4">
              {row.orderCount}
            </td>
            <td className="px-4 py-3.5 text-right tabular-nums text-fg sm:px-4">
              {formatDistance(row.distanceKm)}
            </td>
            <td className="px-4 py-3.5 font-medium tabular-nums text-fg sm:px-4">
              {formatTimestampCell(row.assignedAt)}
            </td>
            <td className="px-4 py-3.5 font-medium tabular-nums text-fg sm:px-4">
              {formatTimestampCell(row.startedAt)}
            </td>
            <td className="px-4 py-3.5 font-medium tabular-nums text-fg sm:px-4">
              {formatTimestampCell(row.completedAt)}
            </td>
            <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-fg sm:px-4">
              {formatDurationMinutes(row.durationMinutes)}
            </td>
            <td className="px-4 py-3.5 whitespace-pre-wrap break-words text-sm text-fg sm:px-4">
              {row.cancellationReason ?? '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AdminRiderKpiDetailModal({ riderId, filters, open, onClose }: Props) {
  const [jobsPage, setJobsPage] = useState(1);
  const jobsPageSize = 20;

  useEffect(() => {
    if (open) setJobsPage(1);
  }, [open, riderId, filters.storeId, filters.dateFrom, filters.dateTo]);

  const detailQuery = useQuery({
    queryKey: ['admin-rider-kpi-detail', riderId, filters, jobsPage, jobsPageSize],
    queryFn: async () =>
      (await adminFetch(
        `/admin/driver-analytics/rider/${encodeURIComponent(riderId)}${buildDetailQuery(filters, jobsPage, jobsPageSize)}`,
      )).data as RiderKpiDetailResponse,
    enabled: open && !!riderId,
  });

  const data = detailQuery.data;
  const jobs = data?.jobs;
  const totalJobPages = jobs ? Math.max(1, Math.ceil(jobs.total / jobs.pageSize)) : 1;
  const jobRows = jobs?.rows ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/45 supports-backdrop-filter:backdrop-blur-sm"
        className="relative fixed top-1/2 left-1/2 flex h-[90vh] max-h-[920px] w-[94vw] !max-w-[1560px] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-2xl border border-navy-border bg-white p-0 text-fg shadow-2xl duration-200 data-open:zoom-in-95 max-md:inset-0 max-md:top-0 max-md:left-0 max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none dark:bg-navy-card"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Rider KPI details</DialogTitle>
          <DialogDescription>
            Performance metrics and contributing jobs for the selected period.
          </DialogDescription>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <>
            <DialogClose
              aria-label="Close rider details"
              title="Close rider details"
              className="absolute right-5 top-5 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98] dark:border-navy-border dark:bg-navy-card dark:text-slate-300 dark:hover:bg-navy-light dark:hover:text-fg"
            >
              <X className="h-5 w-5" aria-hidden />
            </DialogClose>
            <div className="flex flex-1 items-center justify-center gap-3 px-6 py-20 text-sm text-muted">
              <Loader2 size={20} className="animate-spin" aria-hidden />
              <span>Loading rider details…</span>
            </div>
          </>
        ) : detailQuery.isError ? (
          <>
            <DialogClose
              aria-label="Close rider details"
              title="Close rider details"
              className="absolute right-5 top-5 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98] dark:border-navy-border dark:bg-navy-card dark:text-slate-300 dark:hover:bg-navy-light dark:hover:text-fg"
            >
              <X className="h-5 w-5" aria-hidden />
            </DialogClose>
            <div className="flex flex-1 items-center justify-center px-6 py-20 text-center text-sm text-red-400">
              {(detailQuery.error as Error).message || 'Failed to load rider details.'}
            </div>
          </>
        ) : data ? (
          <>
            <div className="sticky top-0 z-10 shrink-0 border-b border-navy-border bg-gradient-to-r from-brand/[0.07] via-blue-50/50 to-white dark:from-brand/10 dark:via-navy-light/30 dark:to-navy-card">
              <DialogClose
                aria-label="Close rider details"
                title="Close rider details"
                className="absolute right-5 top-5 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98] dark:border-navy-border dark:bg-navy-card dark:text-slate-300 dark:hover:bg-navy-light dark:hover:text-fg"
              >
                <X className="h-5 w-5" aria-hidden />
              </DialogClose>
              <div className="flex items-start gap-3.5 px-6 py-5 pr-16 sm:px-6">
                <RiderAvatar name={data.rider.name} seed={data.rider.id} size="lg" premium />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-xl font-semibold leading-tight text-fg">
                      {data.rider.name}
                    </h2>
                    <span
                      className={adminBadgeClass(
                        DUTY_STATUS_BADGE[data.rider.dutyStatus] ?? 'neutral',
                      )}
                    >
                      {DUTY_STATUS_LABEL[data.rider.dutyStatus] ?? data.rider.dutyStatus}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-white/80 px-3 py-1 text-[13px] text-fg dark:bg-navy-card/80">
                      <CalendarDays size={14} className="shrink-0 text-brand" aria-hidden />
                      {formatPeriod(filters.dateFrom, filters.dateTo)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-white/80 px-3 py-1 text-[13px] text-fg dark:bg-navy-card/80">
                      <Building2 size={14} className="shrink-0 text-brand" aria-hidden />
                      {data.rider.branch ?? '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-6 py-5 sm:px-6">
              <section>
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-fg">Performance metrics</h3>
                  <p className="mt-1 text-[13px] text-muted sm:text-sm">
                    KPI totals for the selected period.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-3">
                  <MetricCategoryPanel title="Availability" icon={Wifi}>
                    <RiderDetailKpiItem
                      premium
                      emphasized
                      icon={UserCheck}
                      label="Attendance days"
                      value={data.kpi.attendanceDays}
                      tone="blue"
                    />
                    <RiderDetailKpiItem
                      premium
                      emphasized
                      icon={Wifi}
                      label="Online time"
                      value={formatDurationMinutes(data.kpi.onlineTimeMinutes)}
                      tone="blue"
                    />
                  </MetricCategoryPanel>

                  <MetricCategoryPanel title="Delivery output" icon={ClipboardList} twoColumn>
                    <RiderDetailKpiItem
                      premium
                      icon={ClipboardList}
                      label="Total jobs"
                      value={data.kpi.totalJobs}
                      tone="neutral"
                    />
                    <RiderDetailKpiItem
                      premium
                      icon={CheckCircle2}
                      label="Completed jobs"
                      value={data.kpi.completedJobs}
                      tone="green"
                    />
                    <RiderDetailKpiItem
                      premium
                      icon={XCircle}
                      label="Cancelled jobs"
                      value={data.kpi.cancelledJobs}
                      tone="red"
                    />
                    <RiderDetailKpiItem
                      premium
                      icon={Ban}
                      label="Rejected jobs"
                      value={data.kpi.rejectedJobs}
                      tone="red"
                    />
                    <RiderDetailKpiItem
                      premium
                      icon={Package}
                      label="Total orders"
                      value={data.kpi.totalOrders}
                      tone="neutral"
                    />
                    <RiderDetailKpiItem
                      premium
                      icon={MapPin}
                      label="Total distance"
                      value={formatDistance(data.kpi.totalDistanceKm)}
                      tone="blue"
                    />
                  </MetricCategoryPanel>

                  <MetricCategoryPanel title="Efficiency" icon={Gauge}>
                    <RiderDetailKpiItem
                      premium
                      icon={Clock}
                      label="Total delivery time"
                      value={formatDurationMinutes(data.kpi.totalDeliveryTimeMinutes)}
                      tone="neutral"
                    />
                    <RiderDetailKpiItem
                      premium
                      icon={Timer}
                      label="Average time per order"
                      value={formatDurationMinutes(data.kpi.averageTimePerOrderMinutes)}
                      tone="neutral"
                    />
                    <RiderDetailKpiItem
                      premium
                      icon={Gauge}
                      label="Average station time"
                      value={formatDurationMinutes(data.kpi.averageStationTimeMinutes)}
                      tone="neutral"
                    />
                  </MetricCategoryPanel>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-navy-border bg-white shadow-sm dark:bg-navy-card">
                <div className="flex flex-col gap-1.5 border-b border-navy-border px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand dark:bg-brand/15 dark:text-brand-light">
                      <ListOrdered size={16} aria-hidden />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-fg">Contributing jobs</h3>
                      <p className="mt-1 max-w-3xl text-[13px] text-muted sm:text-sm">
                        Jobs included in this rider&apos;s KPI calculations for the selected filters.
                      </p>
                    </div>
                  </div>
                  {jobs?.total != null && (
                    <p className="shrink-0 text-sm font-medium text-muted">
                      {jobs.total.toLocaleString()} job{jobs.total === 1 ? '' : 's'}
                    </p>
                  )}
                </div>

                {jobRows.length === 0 ? (
                  <div className="px-6 py-14 text-center text-base text-muted">
                    No contributing jobs for this period.
                  </div>
                ) : (
                  <>
                    <div className="hidden lg:block">{/* desktop table */}
                      <JobsTable rows={jobRows} />
                    </div>
                    <div className="space-y-4 p-4 lg:hidden">
                      {jobRows.map((row) => (
                        <JobCard key={row.id} row={row} />
                      ))}
                    </div>
                  </>
                )}

                {jobs && jobs.total > jobs.pageSize && (
                  <JobsPagination
                    jobsPage={jobsPage}
                    totalJobPages={totalJobPages}
                    onPrevious={() => setJobsPage((p) => Math.max(1, p - 1))}
                    onNext={() => setJobsPage((p) => p + 1)}
                  />
                )}
              </section>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
