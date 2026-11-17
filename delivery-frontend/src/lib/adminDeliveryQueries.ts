import { todayDateString } from '@/lib/datetime';

function isPastScheduleDay(scheduledAt?: string): boolean {
  if (!scheduledAt) return false;
  const day = scheduledAt.slice(0, 10);
  return day < todayDateString();
}

export type DeliveryJobsQueryParams = {
  storeId?: string;
  status?: string;
  driverId?: string;
  dateFrom?: string;
  dateTo?: string;
  scheduledAtFrom?: string;
  scheduledAtTo?: string;
  liveScope?: boolean;
};

/** Same statuses as the delivery page Active tab (jobs with real orders, not incomplete). */
export const ACTIVE_DELIVERY_JOB_STATUSES = new Set([
  'SCHEDULED',
  'ASSIGNED',
  'QUEUED',
  'IN_PROGRESS',
  'RETURNING',
]);

export function isActiveDeliveryJob(job: {
  status: string;
  orderCount: number;
  displayStatus?: string | null;
}): boolean {
  return ACTIVE_DELIVERY_JOB_STATUSES.has(job.status) && job.orderCount > 0 && !job.displayStatus;
}

/** Incomplete tab sub-status values from API `displayStatus` (or raw `status` for terminal cases). */
export const INCOMPLETE_JOB_REASONS = [
  'MISSED',
  'ABANDONED',
  'PARTIALLY_COMPLETED',
  'CANCELLED',
  'VEHICLE_FAILURE',
] as const;

export type IncompleteJobReason = (typeof INCOMPLETE_JOB_REASONS)[number];

const HELD_DELIVERY_JOB_STATUSES = new Set(['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING']);
const ADMIN_CANCEL_BLOCKED_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'VEHICLE_FAILURE']);

/** HQ "close ride" — incomplete sub-status or rider-blocking held job (not already terminal). */
export function canAdminCancelDeliveryJob(job: {
  status: string;
  displayStatus?: string | null;
  driver?: { id?: string; name?: string } | null;
  scheduledAt?: string;
}): boolean {
  if (ADMIN_CANCEL_BLOCKED_STATUSES.has(job.status)) return false;
  const display = job.displayStatus ?? job.status;
  if (display === 'CANCELLED') return false;
  if (display === 'MISSED' || display === 'ABANDONED' || display === 'PARTIALLY_COMPLETED') {
    return true;
  }
  if (job.status === 'SCHEDULED' && !job.driver && isPastScheduleDay(job.scheduledAt)) return true;
  if (job.driver && HELD_DELIVERY_JOB_STATUSES.has(job.status)) return true;
  return false;
}

export function filterIncompleteJobsByReason<T extends { status: string; displayStatus?: string | null }>(
  jobs: T[],
  reason: string,
): T[] {
  if (!reason) return jobs;
  return jobs.filter((job) => (job.displayStatus ?? job.status) === reason);
}

export function buildDeliveryJobsQuery(params: DeliveryJobsQueryParams): string {
  const qs = new URLSearchParams();
  if (params.storeId) qs.set('storeId', params.storeId);
  if (params.status) qs.set('status', params.status);
  if (params.driverId) qs.set('driverId', params.driverId);
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params.dateTo) qs.set('dateTo', params.dateTo);
  if (params.scheduledAtFrom) qs.set('scheduledAtFrom', params.scheduledAtFrom);
  if (params.scheduledAtTo) qs.set('scheduledAtTo', params.scheduledAtTo);
  if (params.liveScope) qs.set('liveScope', '1');
  const query = qs.toString();
  return query ? `?${query}` : '';
}

/** Cashiers always see today's schedules regardless of filter UI state. */
export function effectiveScheduleDates(
  cashierMode: boolean,
  dateFrom: string,
  dateTo: string,
): { from: string; to: string } {
  if (cashierMode) {
    const today = todayDateString();
    return { from: today, to: today };
  }
  return { from: dateFrom, to: dateTo };
}

export const DELIVERY_TAB_QUERY_KEYS: Partial<Record<string, string[]>> = {
  dashboard: ['admin-delivery-dashboard'],
  drivers: ['admin-driver-pool'],
  complaints: ['admin-driver-complaints'],
  failures: ['admin-delivery-failures'],
  vehicleBreakdowns: ['admin-vehicle-breakdowns'],
  requests: ['admin-driver-branch-requests'],
  analytics: ['admin-driver-analytics'],
};
