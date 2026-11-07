import { todayDateString } from '@/lib/datetime';

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
  requests: ['admin-driver-branch-requests'],
  analytics: ['admin-driver-analytics'],
};
