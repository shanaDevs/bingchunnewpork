import { dateStringInColombo } from './datetime';

export const DELIVERY_DASHBOARD_STATUSES = [
  'SCHEDULED',
  'ASSIGNED',
  'QUEUED',
  'IN_PROGRESS',
  'RETURNING',
  'COMPLETED',
  'CANCELLED',
  'VEHICLE_FAILURE',
] as const;

export type DeliveryDashboardStatus = (typeof DELIVERY_DASHBOARD_STATUSES)[number];

export type DeliveryDashboardStatusCounts = Record<DeliveryDashboardStatus, number>;

export type DeliveryDashboardDailyPoint = {
  date: string;
  completedJobs: number;
  distinctOrders: number;
  totalDistanceKm: number;
};

export type DeliveryDashboardBranchRow = {
  storeId: string;
  storeName: string;
  completedJobs: number;
  distinctOrders: number;
  totalDistanceKm: number;
};

type CompletedJobSlice = {
  completedAt: Date | null;
  storeId: string;
  totalDistanceKm: number | null;
  store?: { name: string } | null;
  jobOrders: Array<{ orderId: string }>;
};

export function emptyStatusCounts(): DeliveryDashboardStatusCounts {
  return {
    SCHEDULED: 0,
    ASSIGNED: 0,
    QUEUED: 0,
    IN_PROGRESS: 0,
    RETURNING: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    VEHICLE_FAILURE: 0,
  };
}

export function buildStatusCounts(
  groups: Array<{ status: string; count: number }>,
): DeliveryDashboardStatusCounts {
  const counts = emptyStatusCounts();
  for (const group of groups) {
    if (group.status in counts) {
      counts[group.status as DeliveryDashboardStatus] = group.count;
    }
  }
  return counts;
}

function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

function eachDateInclusive(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end && days.length < 400) {
    days.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return days;
}

export function buildDailySeries(
  jobs: CompletedJobSlice[],
  dateFrom?: Date,
  dateTo?: Date,
): DeliveryDashboardDailyPoint[] {
  const byDate = new Map<string, { jobs: number; orders: Set<string>; km: number }>();
  for (const job of jobs) {
    if (!job.completedAt) continue;
    const date = dateStringInColombo(job.completedAt);
    const bucket = byDate.get(date) ?? { jobs: 0, orders: new Set<string>(), km: 0 };
    bucket.jobs += 1;
    bucket.km += job.totalDistanceKm ?? 0;
    for (const link of job.jobOrders) bucket.orders.add(link.orderId);
    byDate.set(date, bucket);
  }

  const dates =
    dateFrom && dateTo
      ? eachDateInclusive(dateStringInColombo(dateFrom), dateStringInColombo(dateTo))
      : [...byDate.keys()].sort();

  return dates.map((date) => {
    const bucket = byDate.get(date);
    return {
      date,
      completedJobs: bucket?.jobs ?? 0,
      distinctOrders: bucket?.orders.size ?? 0,
      totalDistanceKm: Math.round((bucket?.km ?? 0) * 10) / 10,
    };
  });
}

export function aggregateTopBranches(
  jobs: CompletedJobSlice[],
  limit = 5,
): DeliveryDashboardBranchRow[] {
  const byStore = new Map<
    string,
    { storeName: string; completedJobs: number; orderIds: Set<string>; totalDistanceKm: number }
  >();

  for (const job of jobs) {
    const existing = byStore.get(job.storeId) ?? {
      storeName: job.store?.name ?? 'Branch',
      completedJobs: 0,
      orderIds: new Set<string>(),
      totalDistanceKm: 0,
    };
    existing.completedJobs += 1;
    existing.totalDistanceKm += job.totalDistanceKm ?? 0;
    if (job.store?.name) existing.storeName = job.store.name;
    for (const link of job.jobOrders) existing.orderIds.add(link.orderId);
    byStore.set(job.storeId, existing);
  }

  return [...byStore.entries()]
    .map(([storeId, data]) => ({
      storeId,
      storeName: data.storeName,
      completedJobs: data.completedJobs,
      distinctOrders: data.orderIds.size,
      totalDistanceKm: Math.round(data.totalDistanceKm * 10) / 10,
    }))
    .sort(
      (a, b) =>
        b.completedJobs - a.completedJobs ||
        b.distinctOrders - a.distinctOrders ||
        b.totalDistanceKm - a.totalDistanceKm,
    )
    .slice(0, limit);
}
