import { describe, expect, it } from 'vitest';
import {
  inProgressOrdersWhere,
  waitingReceivedCreatedAt,
  waitingReceivedOrdersWhere,
} from '../../src/lib/dashboardQueueCounts';

const range = {
  gte: new Date('2026-10-29T00:00:00.000Z'),
  lte: new Date('2026-10-29T23:59:59.999Z'),
};

describe('inProgressOrdersWhere', () => {
  it('counts only pickup queue tabs for pickup-only branches', () => {
    expect(
      inProgressOrdersWhere({ storeId: 'store-nugegoda' }, range, { pickupOnly: true }),
    ).toEqual({
      storeId: 'store-nugegoda',
      createdAt: { gte: range.gte, lte: range.lte },
      status: { in: ['RECEIVED', 'PREPARING', 'READY'] },
      OR: [
        {
          orderMode: 'TAKEAWAY',
          OR: [{ paymentStatus: 'PAID' }, { paymentMethod: 'CASH_AT_COUNTER' }],
        },
      ],
    });
  });

  it('counts the orders-page queue for the selected period', () => {
    expect(inProgressOrdersWhere({ storeId: 'store-nugegoda' }, range)).toEqual({
      storeId: 'store-nugegoda',
      createdAt: { gte: range.gte, lte: range.lte },
      status: { in: ['RECEIVED', 'PREPARING', 'READY'] },
      OR: [
        {
          orderMode: 'TAKEAWAY',
          OR: [{ paymentStatus: 'PAID' }, { paymentMethod: 'CASH_AT_COUNTER' }],
        },
        { orderMode: 'DELIVERY', paymentStatus: 'PAID' },
      ],
    });
  });
});

describe('waitingReceivedCreatedAt', () => {
  it('keeps only orders in the period that are already 30 minutes old', () => {
    const now = new Date('2026-10-29T10:00:00.000Z');
    expect(waitingReceivedCreatedAt(range, now)).toEqual({
      gte: range.gte,
      lt: new Date('2026-10-29T09:30:00.000Z'),
    });
  });

  it('returns null when the period has not been open for 30 minutes', () => {
    const now = new Date('2026-10-29T00:20:00.000Z');
    expect(waitingReceivedCreatedAt(range, now)).toBeNull();
    expect(waitingReceivedOrdersWhere({ storeId: 'store-nugegoda' }, range, now)).toBeNull();
  });

  it('includes the whole period when it ended more than 30 minutes ago', () => {
    const now = new Date('2026-10-30T12:00:00.000Z');
    expect(waitingReceivedCreatedAt(range, now)).toEqual({
      gte: range.gte,
      lte: range.lte,
    });
  });
});

describe('waitingReceivedOrdersWhere', () => {
  it('counts received orders only, with the same queue visibility', () => {
    const now = new Date('2026-10-29T10:00:00.000Z');
    expect(waitingReceivedOrdersWhere({ storeId: 'store-nugegoda' }, range, now)).toEqual({
      storeId: 'store-nugegoda',
      createdAt: {
        gte: range.gte,
        lt: new Date('2026-10-29T09:30:00.000Z'),
      },
      status: 'RECEIVED',
      OR: [
        {
          orderMode: 'TAKEAWAY',
          OR: [{ paymentStatus: 'PAID' }, { paymentMethod: 'CASH_AT_COUNTER' }],
        },
        { orderMode: 'DELIVERY', paymentStatus: 'PAID' },
      ],
    });
  });
});
