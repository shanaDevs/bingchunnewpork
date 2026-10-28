import { describe, expect, it } from 'vitest';
import {
  generateTrackToken,
  resolveOrderAccess,
  toPublicOrderView,
} from '../../src/lib/orderAccess';

describe('orderAccess', () => {
  const order = {
    id: 'order-uuid',
    orderNumber: 'BC260901-1234',
    trackToken: 'secret-track-token',
    userId: 'user-1',
  };

  it('allows admin access without track token', () => {
    const result = resolveOrderAccess({
      order,
      identifier: order.orderNumber,
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    expect(result).toEqual({ allowed: true, mode: 'admin' });
  });

  it('allows owner by user id', () => {
    const result = resolveOrderAccess({
      order,
      identifier: order.id,
      user: { sub: 'user-1', type: 'user' },
    });
    expect(result).toEqual({ allowed: true, mode: 'owner' });
  });

  it('allows public access only with track token', () => {
    const allowed = resolveOrderAccess({
      order,
      identifier: order.trackToken!,
      trackToken: order.trackToken,
    });
    expect(allowed).toEqual({ allowed: true, mode: 'track_token' });

    const denied = resolveOrderAccess({
      order,
      identifier: order.orderNumber,
    });
    expect(denied.allowed).toBe(false);
  });

  it('strips sensitive fields from public order view', () => {
    const publicView = toPublicOrderView({
      id: order.id,
      orderNumber: order.orderNumber,
      guestPhone: '0771234567',
      guestEmail: 'a@b.com',
      deliveryCode: '123456',
      status: 'RECEIVED',
      processedByName: 'Cashier B',
      processedByAdminId: 'cashier-b',
      statusEvents: [{ id: 'e1', status: 'READY', actorName: 'Cashier B', actorAdminId: 'cashier-b' }],
    });
    expect(publicView).not.toHaveProperty('guestPhone');
    expect(publicView).not.toHaveProperty('deliveryCode');
    expect(publicView).not.toHaveProperty('processedByName');
    expect(publicView).not.toHaveProperty('processedByAdminId');
    expect(publicView.status).toBe('RECEIVED');
    expect((publicView.statusEvents as Array<Record<string, unknown>>)[0]).not.toHaveProperty('actorName');
  });

  it('generates unique track tokens', () => {
    expect(generateTrackToken()).not.toEqual(generateTrackToken());
  });
});
