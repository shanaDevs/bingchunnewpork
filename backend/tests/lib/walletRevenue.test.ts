import { describe, expect, it } from 'vitest';
import {
  isCardPaymentMethod,
  isCashPaymentMethod,
  isCounterCashPaymentMethod,
  mapWalletReportOrders,
  orderCreatedAtFilter,
  platformItemSalesLkr,
  summarizeOrderRevenue,
  summarizeOrderRevenueFromGroups,
  summarizePlatformSalesLkr,
  summarizeRevenueChannelsLkr,
} from '../../src/lib/walletRevenue';

describe('isCardPaymentMethod', () => {
  it('treats CARD, PAYHERE, and LOYALTY_POINTS as card/online', () => {
    expect(isCardPaymentMethod('CARD')).toBe(true);
    expect(isCardPaymentMethod('PAYHERE')).toBe(true);
    expect(isCardPaymentMethod('LOYALTY_POINTS')).toBe(true);
    expect(isCardPaymentMethod('CASH_AT_COUNTER')).toBe(false);
    expect(isCardPaymentMethod('CASH_ON_DELIVERY')).toBe(false);
  });
});

describe('isCounterCashPaymentMethod', () => {
  it('only matches CASH_AT_COUNTER', () => {
    expect(isCounterCashPaymentMethod('CASH_AT_COUNTER')).toBe(true);
    expect(isCounterCashPaymentMethod('CASH_ON_DELIVERY')).toBe(false);
    expect(isCounterCashPaymentMethod('CARD')).toBe(false);
  });
});

describe('isCashPaymentMethod', () => {
  it('matches legacy COD and counter cash', () => {
    expect(isCashPaymentMethod('CASH_ON_DELIVERY')).toBe(true);
    expect(isCashPaymentMethod('CASH_AT_COUNTER')).toBe(true);
    expect(isCashPaymentMethod('PAYHERE')).toBe(false);
  });
});

describe('platformItemSalesLkr', () => {
  it('prefers subtotal minus discounts when subtotal is present', () => {
    expect(
      platformItemSalesLkr({
        total: 1200,
        orderMode: 'DELIVERY',
        paymentMethod: 'PAYHERE',
        subtotal: 1000,
        discount: 50,
        loyaltyDiscount: 50,
        deliveryFee: 150,
        convenientFee: 50,
      }),
    ).toBe(900);
  });

  it('falls back to total minus delivery and convenience fees', () => {
    expect(
      platformItemSalesLkr({
        total: 1200,
        orderMode: 'DELIVERY',
        paymentMethod: 'PAYHERE',
        deliveryFee: 150,
        convenientFee: 50,
      }),
    ).toBe(1000);
  });

  it('never returns a negative item sales value', () => {
    expect(
      platformItemSalesLkr({
        total: 100,
        orderMode: 'TAKEAWAY',
        paymentMethod: 'CASH_AT_COUNTER',
        subtotal: 100,
        discount: 200,
      }),
    ).toBe(0);
  });
});

describe('summarizeRevenueChannelsLkr', () => {
  it('buckets paid orders by channel', () => {
    expect(
      summarizeRevenueChannelsLkr([
        { total: 500, orderMode: 'TAKEAWAY', paymentMethod: 'CASH_AT_COUNTER' },
        { total: 600, orderMode: 'TAKEAWAY', paymentMethod: 'CARD' },
        { total: 700, orderMode: 'TAKEAWAY', paymentMethod: 'PAYHERE' },
        { total: 800, orderMode: 'DELIVERY', paymentMethod: 'PAYHERE' },
        { total: 900, orderMode: 'DELIVERY', paymentMethod: 'CASH_AT_COUNTER' },
      ]),
    ).toEqual({
      pickupCash: 500,
      pickupCard: 600,
      pickupOnline: 700,
      deliveryCard: 800,
    });
  });

  it('returns zeros for an empty list', () => {
    expect(summarizeRevenueChannelsLkr([])).toEqual({
      pickupCash: 0,
      pickupCard: 0,
      pickupOnline: 0,
      deliveryCard: 0,
    });
  });
});

describe('summarizePlatformSalesLkr', () => {
  it('summarizes item sales excluding delivery and convenience fees', () => {
    const summary = summarizePlatformSalesLkr([
      {
        total: 1150,
        orderMode: 'TAKEAWAY',
        paymentMethod: 'CASH_AT_COUNTER',
        subtotal: 1000,
        discount: 0,
        loyaltyDiscount: 0,
      },
      {
        total: 1265,
        orderMode: 'DELIVERY',
        paymentMethod: 'PAYHERE',
        subtotal: 1000,
        discount: 0,
        loyaltyDiscount: 0,
        deliveryFee: 150,
        convenientFee: 65,
      },
    ]);

    expect(summary.pickupCash).toBe(1000);
    expect(summary.deliveryOnline).toBe(1000);
    expect(summary.onlineSales).toBe(1000);
    expect(summary.offlineCash).toBe(1000);
    expect(summary.offlineTotal).toBe(1000);
    expect(summary.totalPlatformSales).toBe(2000);
    expect(summary.orderCount).toBe(2);
  });
});

describe('summarizeOrderRevenue', () => {
  it('returns channel totals in cents', () => {
    expect(
      summarizeOrderRevenue([
        { total: 10, orderMode: 'TAKEAWAY', paymentMethod: 'CASH_AT_COUNTER' },
        { total: 20, orderMode: 'TAKEAWAY', paymentMethod: 'CARD' },
        { total: 30, orderMode: 'DELIVERY', paymentMethod: 'PAYHERE' },
      ]),
    ).toEqual({
      totalIn: 6000,
      pickupCashIn: 1000,
      pickupCardIn: 2000,
      deliveryCardIn: 3000,
      deliveryIn: 3000,
      pickupOnlineIn: 2000,
      pickupStoreIn: 1000,
    });
  });
});

describe('summarizeOrderRevenueFromGroups', () => {
  it('matches per-order summarizeOrderRevenue for the same underlying orders', () => {
    const orders = [
      { total: 10, orderMode: 'TAKEAWAY', paymentMethod: 'CASH_AT_COUNTER' },
      { total: 20, orderMode: 'TAKEAWAY', paymentMethod: 'CARD' },
      { total: 30, orderMode: 'DELIVERY', paymentMethod: 'PAYHERE' },
      { total: 5, orderMode: 'TAKEAWAY', paymentMethod: 'CARD' },
    ];
    const groupMap = new Map<string, number>();
    for (const o of orders) {
      const key = `${o.orderMode}\0${o.paymentMethod}`;
      groupMap.set(key, (groupMap.get(key) ?? 0) + o.total);
    }
    const groups = [...groupMap.entries()].map(([key, totalSum]) => {
      const [orderMode, paymentMethod] = key.split('\0');
      return { orderMode, paymentMethod, totalSum };
    });
    expect(summarizeOrderRevenueFromGroups(groups)).toEqual(summarizeOrderRevenue(orders));
  });
});

describe('mapWalletReportOrders', () => {
  it('maps store name, payment channel, and truncated item summary', () => {
    const [row] = mapWalletReportOrders([
      {
        id: 'o1',
        orderNumber: 'BC1',
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        orderMode: 'DELIVERY',
        paymentMethod: 'PAYHERE',
        paymentStatus: 'PAID',
        status: 'DELIVERED',
        total: 1500,
        guestName: 'Ada',
        guestPhone: '0771234567',
        queuePosition: null,
        store: { name: 'Nugegoda' },
        items: [
          { productName: 'Milk Tea', quantity: 2 },
          { productName: 'Pearl', quantity: 1 },
          { productName: 'Jelly', quantity: 1 },
          { productName: 'Extra', quantity: 1 },
        ],
      },
    ]);

    expect(row.storeName).toBe('Nugegoda');
    expect(row.paymentChannel).toBe('CARD');
    expect(row.itemSummary).toBe('2× Milk Tea, 1× Pearl, 1× Jelly +1 more');
  });

  it('labels cash payment methods as CASH channel', () => {
    const [row] = mapWalletReportOrders([
      {
        id: 'o2',
        orderNumber: 'BC2',
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        orderMode: 'TAKEAWAY',
        paymentMethod: 'CASH_AT_COUNTER',
        paymentStatus: 'PAID',
        status: 'DELIVERED',
        total: 500,
        guestName: null,
        guestPhone: null,
        queuePosition: 3,
        store: { name: 'Kandy' },
        items: [{ productName: 'Tea', quantity: 1 }],
      },
    ]);

    expect(row.paymentChannel).toBe('CASH');
    expect(row.itemSummary).toBe('1× Tea');
  });
});

describe('orderCreatedAtFilter', () => {
  it('returns an empty object when neither bound is provided', () => {
    expect(orderCreatedAtFilter()).toEqual({});
  });

  it('builds inclusive UTC day bounds', () => {
    expect(orderCreatedAtFilter('2026-07-01', '2026-07-02')).toEqual({
      createdAt: {
        gte: new Date('2026-07-01T00:00:00.000Z'),
        lte: new Date('2026-07-02T23:59:59.999Z'),
      },
    });
  });

  it('supports open-ended ranges', () => {
    expect(orderCreatedAtFilter('2026-07-01')).toEqual({
      createdAt: { gte: new Date('2026-07-01T00:00:00.000Z') },
    });
    expect(orderCreatedAtFilter(undefined, '2026-07-02')).toEqual({
      createdAt: { lte: new Date('2026-07-02T23:59:59.999Z') },
    });
  });
});
