import { describe, expect, it } from 'vitest';
import {
  computeRiderEfficiencyMetrics,
  type RiderEfficiencyEventRow,
  type RiderEfficiencyJobRow,
} from '../src/riderEfficiency';

const t0 = new Date('2026-01-01T10:00:00.000Z');
const t10 = new Date('2026-01-01T10:10:00.000Z');
const t20 = new Date('2026-01-01T10:20:00.000Z');
const t30 = new Date('2026-01-01T10:30:00.000Z');
const t40 = new Date('2026-01-01T10:40:00.000Z');
const t50 = new Date('2026-01-01T10:50:00.000Z');

function job(
  overrides: Partial<RiderEfficiencyJobRow> & Pick<RiderEfficiencyJobRow, 'id'>,
): RiderEfficiencyJobRow {
  return {
    status: 'COMPLETED',
    startedAt: t0,
    completedAt: t50,
    jobOrders: [{ orderId: 'o1' }],
    ...overrides,
  };
}

function ev(
  overrides: Partial<RiderEfficiencyEventRow> & Pick<RiderEfficiencyEventRow, 'orderId' | 'jobId' | 'state' | 'createdAt'>,
): RiderEfficiencyEventRow {
  return overrides as RiderEfficiencyEventRow;
}

describe('computeRiderEfficiencyMetrics', () => {
  it('sums per-order event durations for total; average reconciles with count', () => {
    const j = job({
      id: 'j1',
      jobOrders: [{ orderId: 'o1' }, { orderId: 'o2' }],
      startedAt: t0,
      completedAt: t30,
    });
    const events = new Map<string, RiderEfficiencyEventRow[]>([
      [
        'j1',
        [
          ev({ orderId: 'o1', jobId: 'j1', state: 'PICKED_UP', createdAt: t0 }),
          ev({ orderId: 'o1', jobId: 'j1', state: 'DELIVERED', createdAt: t10 }),
          ev({ orderId: 'o2', jobId: 'j1', state: 'PICKED_UP', createdAt: t0 }),
          ev({ orderId: 'o2', jobId: 'j1', state: 'DELIVERED', createdAt: t20 }),
        ],
      ],
    ]);

    const m = computeRiderEfficiencyMetrics([j], events);
    expect(m.orderDeliveryCount).toBe(2);
    expect(m.totalDeliveryTimeMinutes).toBe(30);
    expect(m.averageTimePerOrderMinutes).toBe(15);
  });

  it('uses per-order fallback when one order lacks events', () => {
    const j = job({
      id: 'j1',
      jobOrders: [{ orderId: 'o1' }, { orderId: 'o2' }],
      startedAt: t0,
      completedAt: t20,
    });
    const events = new Map<string, RiderEfficiencyEventRow[]>([
      [
        'j1',
        [
          ev({ orderId: 'o1', jobId: 'j1', state: 'PICKED_UP', createdAt: t0 }),
          ev({ orderId: 'o1', jobId: 'j1', state: 'DELIVERED', createdAt: t10 }),
        ],
      ],
    ]);

    const m = computeRiderEfficiencyMetrics([j], events);
    expect(m.orderDeliveryCount).toBe(2);
    expect(m.totalDeliveryTimeMinutes).toBe(20);
    expect(m.averageTimePerOrderMinutes).toBe(10);
  });

  it('uses latest DELIVERED when multiple exist', () => {
    const j = job({ id: 'j1', startedAt: t0, completedAt: t40 });
    const events = new Map<string, RiderEfficiencyEventRow[]>([
      [
        'j1',
        [
          ev({ orderId: 'o1', jobId: 'j1', state: 'PICKED_UP', createdAt: t0 }),
          ev({ orderId: 'o1', jobId: 'j1', state: 'DELIVERED', createdAt: t10 }),
          ev({ orderId: 'o1', jobId: 'j1', state: 'DELIVERED', createdAt: t30 }),
        ],
      ],
    ]);

    const m = computeRiderEfficiencyMetrics([j], events);
    expect(m.totalDeliveryTimeMinutes).toBe(30);
    expect(m.averageTimePerOrderMinutes).toBe(30);
  });

  it('station time is return leg only; omits jobs without final events', () => {
    const withReturn = job({ id: 'j1', completedAt: t40 });
    const noEvents = job({ id: 'j2', completedAt: t40 });
    const events = new Map<string, RiderEfficiencyEventRow[]>([
      [
        'j1',
        [
          ev({ orderId: 'o1', jobId: 'j1', state: 'DELIVERED', createdAt: t20 }),
        ],
      ],
    ]);

    const m = computeRiderEfficiencyMetrics([withReturn, noEvents], events);
    expect(m.averageStationTimeMinutes).toBe(20);
  });

  it('prefers PICKED_UP over EN_ROUTE for pickup start', () => {
    const j = job({ id: 'j1', completedAt: t30 });
    const events = new Map<string, RiderEfficiencyEventRow[]>([
      [
        'j1',
        [
          ev({ orderId: 'o1', jobId: 'j1', state: 'EN_ROUTE', createdAt: t10 }),
          ev({ orderId: 'o1', jobId: 'j1', state: 'PICKED_UP', createdAt: t0 }),
          ev({ orderId: 'o1', jobId: 'j1', state: 'DELIVERED', createdAt: t20 }),
        ],
      ],
    ]);

    const m = computeRiderEfficiencyMetrics([j], events);
    expect(m.totalDeliveryTimeMinutes).toBe(20);
  });

  it('returns zeros and null averages when no completed jobs', () => {
    const m = computeRiderEfficiencyMetrics(
      [{ id: 'x', status: 'CANCELLED', startedAt: null, completedAt: null, jobOrders: [] }],
      new Map(),
    );
    expect(m.totalDeliveryTimeMinutes).toBe(0);
    expect(m.averageTimePerOrderMinutes).toBeNull();
    expect(m.averageStationTimeMinutes).toBeNull();
    expect(m.orderDeliveryCount).toBe(0);
  });
});
