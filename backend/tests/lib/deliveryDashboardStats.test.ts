import { describe, expect, it } from 'vitest';
import {
  aggregateTopBranches,
  buildDailySeries,
  buildStatusCounts,
} from '../../src/lib/deliveryDashboardStats';

describe('deliveryDashboardStats', () => {
  it('fills missing status keys with zero', () => {
    expect(
      buildStatusCounts([
        { status: 'COMPLETED', count: 4 },
        { status: 'IN_PROGRESS', count: 1 },
        { status: 'UNKNOWN', count: 9 },
      ]),
    ).toMatchObject({
      COMPLETED: 4,
      IN_PROGRESS: 1,
      SCHEDULED: 0,
      VEHICLE_FAILURE: 0,
    });
  });

  it('buckets completed jobs by Colombo date and zero-fills the range', () => {
    const series = buildDailySeries(
      [
        {
          completedAt: new Date('2026-03-15T20:30:00.000Z'),
          storeId: 's1',
          totalDistanceKm: 3.2,
          jobOrders: [{ orderId: 'o1' }, { orderId: 'o1' }],
        },
      ],
      new Date('2026-03-15T00:00:00.000Z'),
      new Date('2026-03-16T18:00:00.000Z'),
    );

    expect(series.map((point) => point.date)).toEqual(['2026-03-15', '2026-03-16']);
    expect(series[1]).toMatchObject({
      completedJobs: 1,
      distinctOrders: 1,
      totalDistanceKm: 3.2,
    });
    expect(series[0].completedJobs).toBe(0);
  });

  it('ranks branches by completed jobs', () => {
    const rows = aggregateTopBranches([
      {
        completedAt: new Date('2026-03-16T04:00:00.000Z'),
        storeId: 'a',
        store: { name: 'Branch A' },
        totalDistanceKm: 1,
        jobOrders: [{ orderId: '1' }],
      },
      {
        completedAt: new Date('2026-03-16T05:00:00.000Z'),
        storeId: 'b',
        store: { name: 'Branch B' },
        totalDistanceKm: 8,
        jobOrders: [{ orderId: '2' }],
      },
      {
        completedAt: new Date('2026-03-16T06:00:00.000Z'),
        storeId: 'b',
        store: { name: 'Branch B' },
        totalDistanceKm: 2,
        jobOrders: [{ orderId: '3' }],
      },
    ]);

    expect(rows[0]).toMatchObject({
      storeId: 'b',
      storeName: 'Branch B',
      completedJobs: 2,
      distinctOrders: 2,
      totalDistanceKm: 10,
    });
  });
});
