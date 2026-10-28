import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_CANCEL_WINDOW_MS,
  buildCustomerCancelNote,
  estimateCustomerCancelRefund,
  getCustomerCancelEligibility,
  resolveCancelWindowStart,
  withCustomerCancelRefundFields,
} from '../../src/lib/orderCancel';

describe('resolveCancelWindowStart', () => {
  const createdAt = new Date('2026-08-17T10:00:00.000Z');

  it('uses cancelWindowStartsAt when set', () => {
    const startsAt = new Date('2026-08-17T10:05:00.000Z');
    expect(
      resolveCancelWindowStart({
        createdAt,
        cancelWindowStartsAt: startsAt,
        paymentMethod: 'PAYHERE',
        paymentStatus: 'PAID',
      }),
    ).toBe(startsAt);
  });

  it('returns null for unpaid online orders', () => {
    expect(
      resolveCancelWindowStart({
        createdAt,
        paymentMethod: 'PAYHERE',
        paymentStatus: 'PENDING',
      }),
    ).toBeNull();
  });

  it('falls back to createdAt for cash at counter', () => {
    expect(
      resolveCancelWindowStart({
        createdAt,
        paymentMethod: 'CASH_AT_COUNTER',
        paymentStatus: 'PAID',
      }),
    ).toBe(createdAt);
  });
});

describe('getCustomerCancelEligibility', () => {
  const createdAt = new Date('2026-08-17T10:00:00.000Z');

  it('allows cancel within 10 minutes with full refund tier', () => {
    const now = new Date(createdAt.getTime() + 5 * 60 * 1000);
    const result = getCustomerCancelEligibility({ status: 'RECEIVED', createdAt, now });

    expect(result.canCancel).toBe(true);
    expect(result.cancelWindowEndsAt).toBe(
      new Date(createdAt.getTime() + CUSTOMER_CANCEL_WINDOW_MS).toISOString(),
    );
    expect(result.cancelRefundTier).toBe('full');
    expect(result.cancelWindowExpired).toBe(false);
  });

  it('still allows cancel after 10 minutes with partial refund tier', () => {
    const now = new Date(createdAt.getTime() + CUSTOMER_CANCEL_WINDOW_MS + 1000);
    const result = getCustomerCancelEligibility({ status: 'RECEIVED', createdAt, now });

    expect(result.canCancel).toBe(true);
    expect(result.cancelWindowEndsAt).toBeNull();
    expect(result.cancelRefundTier).toBe('partial');
    expect(result.cancelWindowExpired).toBe(true);
  });

  it('allows cancel from PREPARING with full refund tier within window', () => {
    const now = new Date(createdAt.getTime() + 60 * 1000);
    const result = getCustomerCancelEligibility({ status: 'PREPARING', createdAt, now });

    expect(result.canCancel).toBe(true);
    expect(result.cancelWindowEndsAt).toBe(
      new Date(createdAt.getTime() + CUSTOMER_CANCEL_WINDOW_MS).toISOString(),
    );
    expect(result.cancelRefundTier).toBe('full');
    expect(result.cancelWindowExpired).toBe(false);
  });

  it('allows cancel from READY with partial refund after the window', () => {
    const now = new Date(createdAt.getTime() + CUSTOMER_CANCEL_WINDOW_MS + 1000);
    const result = getCustomerCancelEligibility({ status: 'READY', createdAt, now });

    expect(result.canCancel).toBe(true);
    expect(result.cancelWindowEndsAt).toBeNull();
    expect(result.cancelRefundTier).toBe('partial');
    expect(result.cancelWindowExpired).toBe(true);
  });

  it('allows cancel from OUT_FOR_DELIVERY with partial refund after the window', () => {
    const now = new Date(createdAt.getTime() + CUSTOMER_CANCEL_WINDOW_MS + 1000);
    const result = getCustomerCancelEligibility({ status: 'OUT_FOR_DELIVERY', createdAt, now });

    expect(result.canCancel).toBe(true);
    expect(result.cancelWindowEndsAt).toBeNull();
    expect(result.cancelRefundTier).toBe('partial');
    expect(result.cancelWindowExpired).toBe(true);
  });

  it('does not start full-refund window until online payment is confirmed', () => {
    const now = new Date(createdAt.getTime() + 2 * 60 * 1000);
    const result = getCustomerCancelEligibility({
      status: 'RECEIVED',
      createdAt,
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PENDING',
      now,
    });

    expect(result.canCancel).toBe(true);
    expect(result.cancelWindowEndsAt).toBeNull();
    expect(result.cancelRefundTier).toBeNull();
    expect(result.cancelWindowExpired).toBe(false);
  });

  it('starts full-refund window from payment confirmation time for online orders', () => {
    const paidAt = new Date(createdAt.getTime() + 12 * 60 * 1000);
    const now = new Date(paidAt.getTime() + 2 * 60 * 1000);
    const result = getCustomerCancelEligibility({
      status: 'RECEIVED',
      createdAt,
      cancelWindowStartsAt: paidAt,
      paymentMethod: 'PAYHERE',
      paymentStatus: 'PAID',
      now,
    });

    expect(result.canCancel).toBe(true);
    expect(result.cancelWindowEndsAt).toBe(
      new Date(paidAt.getTime() + CUSTOMER_CANCEL_WINDOW_MS).toISOString(),
    );
    expect(result.cancelRefundTier).toBe('full');
    expect(result.cancelWindowExpired).toBe(false);
  });

  it('blocks cancel when status is DELIVERED or CANCELLED', () => {
    const now = new Date(createdAt.getTime() + 60 * 1000);

    expect(getCustomerCancelEligibility({ status: 'DELIVERED', createdAt, now }).canCancel).toBe(false);
    expect(getCustomerCancelEligibility({ status: 'CANCELLED', createdAt, now }).canCancel).toBe(false);
  });
});

describe('estimateCustomerCancelRefund', () => {
  const paidOnline = {
    total: 1500,
    subtotal: 1400,
    discount: 0,
    loyaltyDiscount: 0,
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
  };

  it('returns null for unpaid orders', () => {
    expect(
      estimateCustomerCancelRefund(
        { ...paidOnline, paymentStatus: 'PENDING' },
        'full',
      ),
    ).toBeNull();
  });

  it('returns full total for full tier', () => {
    expect(estimateCustomerCancelRefund(paidOnline, 'full')).toBe(1500);
  });

  it('returns sales total for partial tier when percentage is not provided', () => {
    expect(estimateCustomerCancelRefund(paidOnline, 'partial')).toBe(1400);
  });

  it('returns status-based partial refund amount when percentage is provided', () => {
    expect(estimateCustomerCancelRefund(paidOnline, 'partial', 80)).toBe(1120);
  });
});

describe('withCustomerCancelRefundFields', () => {
  const paidOnline = {
    total: 1500,
    subtotal: 1400,
    discount: 0,
    loyaltyDiscount: 0,
    deliveryFee: 200,
    convenientFee: 100,
    paymentMethod: 'PAYHERE',
    paymentStatus: 'PAID',
    status: 'PREPARING',
    createdAt: new Date('2026-08-17T10:00:00.000Z'),
  };

  it('exposes cancelRefundPercentage 100 for full refund tier', () => {
    const result = withCustomerCancelRefundFields(
      {
        ...paidOnline,
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
      },
      10,
      80,
    );

    expect(result.cancelRefundTier).toBe('full');
    expect(result.cancelRefundPercentage).toBe(100);
  });

  it('exposes DB partial percentage for partial refund tier', () => {
    const result = withCustomerCancelRefundFields(
      {
        ...paidOnline,
        createdAt: new Date(Date.now() - 15 * 60 * 1000),
      },
      10,
      80,
    );

    expect(result.cancelRefundTier).toBe('partial');
    expect(result.cancelRefundPercentage).toBe(80);
    expect(result.estimatedCancelRefund).toBe(1120);
  });
});

describe('buildCustomerCancelNote', () => {
  it('builds full refund note', () => {
    expect(
      buildCustomerCancelNote('full', {
        deliveryFee: 0,
        convenientFee: 100,
        paymentMethod: 'PAYHERE',
        paymentStatus: 'PAID',
      }),
    ).toBe('Cancelled by customer. Full refund of all paid amount');
  });

  it('builds partial refund note with fees', () => {
    expect(
      buildCustomerCancelNote('partial', {
        deliveryFee: 200,
        convenientFee: 100,
        paymentMethod: 'PAYHERE',
        paymentStatus: 'PAID',
      }, 80),
    ).toBe(
      'Cancelled by customer. Partial refund: 80% of sales total — delivery fee LKR 200 and convenience fee LKR 100 not refunded',
    );
  });
});
