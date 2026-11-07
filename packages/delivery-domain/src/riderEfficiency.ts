import type { DeliveryDomainStateValue } from './jobStateMachine';

/**
 * Per-order and station time figures for admin rider KPI Efficiency (and dashboard period averages).
 * Job callers supply completed jobs plus delivery events grouped by job id.
 */

export type RiderEfficiencyJobRow = {
  id: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  jobOrders: Array<{ orderId: string }>;
};

export type RiderEfficiencyEventRow = {
  orderId: string;
  jobId: string;
  state: DeliveryDomainStateValue;
  createdAt: Date;
};

export type RiderEfficiencyMetrics = {
  totalDeliveryTimeMinutes: number;
  averageTimePerOrderMinutes: number | null;
  averageStationTimeMinutes: number | null;
  /** Orders included in total / average per-order (tests and diagnostics). */
  orderDeliveryCount: number;
};

const FINAL_EVENT_STATES = new Set<DeliveryDomainStateValue>(['DELIVERED', 'FAILED']);
const DELIVERED_STATES = new Set<DeliveryDomainStateValue>(['DELIVERED']);

function durationMs(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  const ms = to.getTime() - from.getTime();
  return ms >= 0 ? ms : null;
}

function averageDuration(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && v >= 0);
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function msToMinutes(ms: number | null): number | null {
  if (ms == null) return null;
  return Math.round((ms / 60000) * 10) / 10;
}

function earliestEvent(
  events: RiderEfficiencyEventRow[],
  states: Set<DeliveryDomainStateValue>,
): RiderEfficiencyEventRow | null {
  let earliest: RiderEfficiencyEventRow | null = null;
  for (const event of events) {
    if (!states.has(event.state)) continue;
    if (!earliest || event.createdAt < earliest.createdAt) {
      earliest = event;
    }
  }
  return earliest;
}

function latestEvent(
  events: RiderEfficiencyEventRow[],
  states: Set<DeliveryDomainStateValue>,
): RiderEfficiencyEventRow | null {
  let latest: RiderEfficiencyEventRow | null = null;
  for (const event of events) {
    if (!states.has(event.state)) continue;
    if (!latest || event.createdAt > latest.createdAt) {
      latest = event;
    }
  }
  return latest;
}

/** Prefer branch pickup; fall back to EN_ROUTE when PICKED_UP was never recorded. */
function pickupEventForOrder(orderEvents: RiderEfficiencyEventRow[]): RiderEfficiencyEventRow | null {
  const pickedUp = earliestEvent(orderEvents, new Set(['PICKED_UP']));
  if (pickedUp) return pickedUp;
  return earliestEvent(orderEvents, new Set(['EN_ROUTE']));
}

export function groupRiderEfficiencyEventsByJobId(
  events: RiderEfficiencyEventRow[],
): Map<string, RiderEfficiencyEventRow[]> {
  const map = new Map<string, RiderEfficiencyEventRow[]>();
  for (const event of events) {
    const existing = map.get(event.jobId) ?? [];
    existing.push(event);
    map.set(event.jobId, existing);
  }
  return map;
}

export function computeRiderEfficiencyMetrics(
  jobs: RiderEfficiencyJobRow[],
  eventsByJobId: Map<string, RiderEfficiencyEventRow[]> = new Map(),
): RiderEfficiencyMetrics {
  let orderDeliveryTimeMs = 0;
  let orderDeliveryCount = 0;
  const stationDurations: Array<number | null> = [];

  for (const job of jobs) {
    if (job.status !== 'COMPLETED') continue;

    const deliveryMs = durationMs(job.startedAt, job.completedAt);
    const jobEvents = eventsByJobId.get(job.id) ?? [];
    const orderCount = job.jobOrders.length;

    for (const link of job.jobOrders) {
      const orderEvents = jobEvents.filter((event) => event.orderId === link.orderId);
      const pickup = pickupEventForOrder(orderEvents);
      const delivered = latestEvent(orderEvents, DELIVERED_STATES);

      let orderMs: number | null = null;
      if (pickup && delivered) {
        orderMs = durationMs(pickup.createdAt, delivered.createdAt);
      } else if (deliveryMs != null && orderCount > 0) {
        orderMs = deliveryMs / orderCount;
      }

      if (orderMs != null && orderMs >= 0) {
        orderDeliveryTimeMs += orderMs;
        orderDeliveryCount += 1;
      }
    }

    const lastFinalEvent = latestEvent(jobEvents, FINAL_EVENT_STATES);
    if (lastFinalEvent && job.completedAt) {
      stationDurations.push(durationMs(lastFinalEvent.createdAt, job.completedAt));
    }
  }

  return {
    totalDeliveryTimeMinutes: msToMinutes(orderDeliveryTimeMs) ?? 0,
    averageTimePerOrderMinutes:
      orderDeliveryCount > 0 ? msToMinutes(orderDeliveryTimeMs / orderDeliveryCount) : null,
    averageStationTimeMinutes: msToMinutes(averageDuration(stationDurations)),
    orderDeliveryCount,
  };
}
