import { describe, expect, it } from 'vitest';
import { deriveAdminOrderDeliveryState } from '../../src/lib/deliveryJobHelpers';

const deliveredAt = new Date('2026-08-31T05:45:00.000Z');
const enRouteAt = new Date('2026-08-31T05:15:00.000Z');
const updatedAt = new Date('2026-08-31T05:50:00.000Z');

describe('deriveAdminOrderDeliveryState', () => {
  it('uses a DELIVERED delivery event as the source of truth', () => {
    expect(
      deriveAdminOrderDeliveryState(
        [{ state: 'DELIVERED', createdAt: deliveredAt, note: null }],
        [],
        { orderStatus: 'OUT_FOR_DELIVERY' },
      ),
    ).toEqual({
      deliveryState: 'Delivered',
      terminalEventAt: deliveredAt,
      failureOutcome: null,
      failureNote: null,
    });
  });

  it('falls back to order.status DELIVERED when the latest event is only EN_ROUTE', () => {
    expect(
      deriveAdminOrderDeliveryState(
        [{ state: 'EN_ROUTE', createdAt: enRouteAt, note: null }],
        [],
        {
          orderStatus: 'DELIVERED',
          statusEvents: [{ status: 'DELIVERED', createdAt: deliveredAt }],
        },
      ),
    ).toEqual({
      deliveryState: 'Delivered',
      terminalEventAt: deliveredAt,
      failureOutcome: null,
      failureNote: null,
    });
  });

  it('falls back to order.status DELIVERED with updatedAt when there are no events', () => {
    expect(
      deriveAdminOrderDeliveryState([], [], {
        orderStatus: 'DELIVERED',
        updatedAt,
      }),
    ).toEqual({
      deliveryState: 'Delivered',
      terminalEventAt: updatedAt,
      failureOutcome: null,
      failureNote: null,
    });
  });

  it('stays pending when there is no terminal event and the order is not DELIVERED', () => {
    expect(
      deriveAdminOrderDeliveryState(
        [{ state: 'EN_ROUTE', createdAt: enRouteAt, note: null }],
        [],
        { orderStatus: 'OUT_FOR_DELIVERY' },
      ),
    ).toEqual({
      deliveryState: 'Pending',
      terminalEventAt: null,
      failureOutcome: null,
      failureNote: null,
    });
  });

  it('treats order.status CANCELLED as Failed with the cancel time and reason', () => {
    const cancelledAt = new Date('2026-08-31T06:00:00.000Z');
    expect(
      deriveAdminOrderDeliveryState(
        [{ state: 'EN_ROUTE', createdAt: enRouteAt, note: null }],
        [],
        {
          orderStatus: 'CANCELLED',
          cancelReason: 'CUSTOMER_REQUEST',
          statusEvents: [{ status: 'CANCELLED', createdAt: cancelledAt }],
        },
      ),
    ).toEqual({
      deliveryState: 'Failed',
      terminalEventAt: cancelledAt,
      failureOutcome: 'CUSTOMER_REQUEST',
      failureNote: 'CUSTOMER_REQUEST',
    });
  });

  it('treats a failed delivery attempt as Failed when there is no DELIVERED event', () => {
    const failedAt = new Date('2026-08-31T06:10:00.000Z');
    expect(
      deriveAdminOrderDeliveryState(
        [{ state: 'EN_ROUTE', createdAt: enRouteAt, note: null }],
        [{ outcome: 'CUSTOMER_UNAVAILABLE', note: 'No answer', createdAt: failedAt, attemptNo: 1 }],
        { orderStatus: 'OUT_FOR_DELIVERY' },
      ),
    ).toEqual({
      deliveryState: 'Failed',
      terminalEventAt: failedAt,
      failureOutcome: 'CUSTOMER_UNAVAILABLE',
      failureNote: 'No answer',
    });
  });

  it('treats a rider complaint as Failed when the order is still pending', () => {
    const complainedAt = new Date('2026-08-31T06:20:00.000Z');
    expect(
      deriveAdminOrderDeliveryState([], [], {
        orderStatus: 'OUT_FOR_DELIVERY',
        complaint: {
          category: 'CUSTOMER_UNAVAILABLE',
          description: 'Gate locked',
          createdAt: complainedAt,
          status: 'OPEN',
        },
      }),
    ).toEqual({
      deliveryState: 'Failed',
      terminalEventAt: complainedAt,
      failureOutcome: 'CUSTOMER_UNAVAILABLE',
      failureNote: 'Gate locked',
    });
  });
});
