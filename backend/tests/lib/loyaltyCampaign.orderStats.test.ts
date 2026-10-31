import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
    },
  },
}));

import { getCustomerOrderStats, LOYALTY_OFFER2_CODE } from '../../src/lib/loyaltyCampaign';
import { prisma } from '../../src/lib/prisma';

describe('getCustomerOrderStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks Offer 2 claimed when a pending order already used the loyalty code', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        subtotal: 1200,
        createdAt: new Date('2026-08-01T10:00:00Z'),
        paymentStatus: 'PAID',
        promoCode: null,
      },
      {
        subtotal: 1500,
        createdAt: new Date('2026-08-05T10:00:00Z'),
        paymentStatus: 'PENDING',
        promoCode: LOYALTY_OFFER2_CODE,
      },
    ] as never);

    const stats = await getCustomerOrderStats('user-1');

    expect(stats.validOrderCount).toBe(1);
    expect(stats.placedOrderCount).toBe(2);
    expect(stats.offer2Claimed).toBe(true);
    expect(stats.offer1Claimed).toBe(false);
  });

  it('counts a single pending order toward placed order stats', async () => {
    const createdAt = new Date('2026-08-10T10:00:00Z');
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        subtotal: 1200,
        createdAt,
        paymentStatus: 'PENDING',
        promoCode: null,
      },
    ] as never);

    const stats = await getCustomerOrderStats('user-1');

    expect(stats.validOrderCount).toBe(0);
    expect(stats.placedOrderCount).toBe(1);
    expect(stats.firstPlacedOrderAt).toEqual(createdAt);
  });
});
