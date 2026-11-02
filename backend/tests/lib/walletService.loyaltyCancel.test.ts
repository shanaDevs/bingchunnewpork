import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: { findMany: vi.fn() },
    store: { findUnique: vi.fn() },
    refund: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/appSchema', () => ({
  getGatewayFeeRate: vi.fn().mockResolvedValue(0.019),
  getConvenienceFeeRates: vi.fn().mockResolvedValue({ takeaway: 0, delivery: 0 }),
}));

vi.mock('../../src/lib/platformPaybackSchema', () => ({
  ensurePlatformPaybackSchema: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../src/lib/prisma';
import { computeBreakdownForPeriod } from '../../src/lib/walletService';
import { periodActivePaidOrdersWhere } from '../../src/lib/walletRevenue';

const STORE_ID = 'store-loyalty-1';
const FROM = '2026-03-01';
const TO = '2026-03-07';

const paidPickupWithLoyalty = {
  total: 900,
  subtotal: 1000,
  deliveryFee: 0,
  convenientFee: 0,
  discount: 0,
  loyaltyDiscount: 100,
  orderMode: 'TAKEAWAY',
  paymentMethod: 'PAYHERE',
  createdAt: new Date('2026-03-03T10:00:00.000Z'),
  storeId: STORE_ID,
  status: 'RECEIVED',
  promotionUsages: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.store.findUnique).mockResolvedValue({
    platformDiscountPaybackEnabled: false,
  } as never);
  vi.mocked(prisma.refund.findMany).mockResolvedValue([]);
});

describe('periodActivePaidOrdersWhere', () => {
  it('requires PAID and excludes CANCELLED so refunded-pending cancels drop loyalty', () => {
    expect(periodActivePaidOrdersWhere(STORE_ID, FROM, TO)).toEqual({
      storeId: STORE_ID,
      paymentStatus: 'PAID',
      status: { not: 'CANCELLED' },
      createdAt: {
        gte: new Date(`${FROM}T00:00:00.000Z`),
        lte: new Date(`${TO}T23:59:59.999Z`),
      },
    });
  });
});

describe('computeBreakdownForPeriod — loyalty after branch cancel', () => {
  it('includes loyaltyDiscount in periodLoyaltyDiscountTotal and netPlatformEarning for active paid pickup', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([paidPickupWithLoyalty] as never);

    const before = await computeBreakdownForPeriod(STORE_ID, FROM, TO);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: periodActivePaidOrdersWhere(STORE_ID, FROM, TO),
      }),
    );
    expect(before.periodLoyaltyDiscountTotal).toBe(10_000); // 100 LKR → cents
    expect(before.commissionFee).toBeGreaterThan(0);
    // Platform absorbs loyalty: net = commission − loyalty
    expect(before.netPlatformEarning).toBe(before.commissionFee - before.periodLoyaltyDiscountTotal);
  });

  it('excludes loyalty and commission for that order once branch cancel filters it out (CANCELLED)', async () => {
    vi.mocked(prisma.order.findMany)
      .mockResolvedValueOnce([paidPickupWithLoyalty] as never)
      .mockResolvedValueOnce([] as never);

    const beforeCancel = await computeBreakdownForPeriod(STORE_ID, FROM, TO);
    expect(beforeCancel.periodLoyaltyDiscountTotal).toBe(10_000);
    expect(beforeCancel.orderCount).toBe(1);

    // After updateOrderStatus → CANCELLED, period query no longer returns the order
    // (paymentStatus may still be PAID until refund completes).
    const afterCancel = await computeBreakdownForPeriod(STORE_ID, FROM, TO);

    expect(prisma.order.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentStatus: 'PAID',
          status: { not: 'CANCELLED' },
        }),
      }),
    );
    expect(afterCancel.periodLoyaltyDiscountTotal).toBe(0);
    expect(afterCancel.commissionFee).toBe(0);
    expect(afterCancel.netPlatformEarning).toBe(0);
    expect(afterCancel.orderCount).toBe(0);
    expect(afterCancel.periodLoyaltyDiscountTotal).toBeLessThan(
      beforeCancel.periodLoyaltyDiscountTotal,
    );
  });

  it('does not keep loyalty cost when only a non-loyalty order remains after cancel', async () => {
    const otherOrder = {
      ...paidPickupWithLoyalty,
      subtotal: 500,
      total: 500,
      loyaltyDiscount: 0,
      status: 'PREPARING',
    };

    vi.mocked(prisma.order.findMany)
      .mockResolvedValueOnce([paidPickupWithLoyalty, otherOrder] as never)
      .mockResolvedValueOnce([otherOrder] as never);

    const before = await computeBreakdownForPeriod(STORE_ID, FROM, TO);
    const after = await computeBreakdownForPeriod(STORE_ID, FROM, TO);

    expect(before.periodLoyaltyDiscountTotal).toBe(10_000);
    expect(after.periodLoyaltyDiscountTotal).toBe(0);
    expect(after.orderCount).toBe(1);
    expect(after.netPlatformEarning).toBe(after.commissionFee);
  });
});
