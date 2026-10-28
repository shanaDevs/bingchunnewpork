import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aggregateHourlySales,
  aggregatePaidRevenueByBucket,
  summarizeRevenueChannelsForScope,
} from '../../src/lib/dashboardOrderAggregates';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from '../../src/lib/prisma';

describe('dashboardOrderAggregates', () => {
  const scope = {
    storeId: 'store-1',
    createdAtGte: new Date('2026-01-01T00:00:00.000Z'),
    createdAtLte: new Date('2026-01-31T23:59:59.999Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps paid revenue buckets from SQL rows', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      { bucket: '2026-01', revenue: 1500, orders: 12 },
    ]);

    const map = await aggregatePaidRevenueByBucket(scope, 'month');
    expect(map.get('2026-01')).toEqual({ revenue: 1500, orders: 12 });
  });

  it('builds hourly peak buckets from SQL rows', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      { hour: 9, day: 1, orders: 4, revenue: 800 },
      { hour: 9, day: 2, orders: 2, revenue: 400 },
    ]);

    const { peakHours, hourlyHeatmap } = await aggregateHourlySales(scope);
    expect(peakHours[9].orders).toBe(6);
    expect(peakHours[9].revenue).toBe(1200);
    expect(hourlyHeatmap[1 * 24 + 9].orders).toBe(4);
    expect(hourlyHeatmap[2 * 24 + 9].orders).toBe(2);
  });

  it('summarizes revenue channels from grouped SQL rows', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([
        {
          orderMode: 'TAKEAWAY',
          paymentMethod: 'CASH_AT_COUNTER',
          total_sum: 1000,
          addon_sum: 0,
          subtotal_sum: 1000,
          discount_sum: 0,
          loyalty_discount_sum: 0,
          delivery_fee_sum: 0,
          convenient_fee_sum: 0,
          delivery_item_sales_sum: 0,
          order_count: 5,
        },
        {
          orderMode: 'DELIVERY',
          paymentMethod: 'PAYHERE',
          total_sum: 2000,
          addon_sum: 0,
          subtotal_sum: 1800,
          discount_sum: 0,
          loyalty_discount_sum: 0,
          delivery_fee_sum: 200,
          convenient_fee_sum: 0,
          delivery_item_sales_sum: 1800,
          order_count: 2,
        },
      ])
      .mockResolvedValueOnce([]);

    const channels = await summarizeRevenueChannelsForScope(scope);
    expect(channels.pickupCash).toBe(1000);
    expect(channels.deliveryCard).toBe(2000);
  });
});
