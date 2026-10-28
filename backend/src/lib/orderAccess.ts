import { randomBytes } from 'crypto';
import type { Request } from 'express';
import type { JwtPayload } from '../middleware/auth';
import { stripStaffAttribution } from './orderActor';

export function generateTrackToken(): string {
  return randomBytes(32).toString('base64url');
}

type OrderAccessRow = {
  id: string;
  orderNumber: string;
  trackToken: string | null;
  userId: string | null;
};

export type OrderAccessResult =
  | { allowed: true; mode: 'admin' | 'owner' | 'track_token' }
  | { allowed: false; reason: string };

function normalizeToken(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolve whether the caller may access an order.
 * Public/guest access requires the unguessable track token — not the order number alone.
 */
export function resolveOrderAccess(opts: {
  order: OrderAccessRow;
  identifier: string;
  trackToken?: string | null;
  user?: JwtPayload;
}): OrderAccessResult {
  const { order, identifier, user } = opts;
  const trackToken = normalizeToken(opts.trackToken);

  if (user?.type === 'admin' && user.role !== 'DELIVERY_DRIVER') {
    return { allowed: true, mode: 'admin' };
  }

  if (user?.type === 'user' && order.userId && order.userId === user.sub) {
    return { allowed: true, mode: 'owner' };
  }

  const orderTrackToken = normalizeToken(order.trackToken);
  if (orderTrackToken) {
    const tokenMatch =
      trackToken === orderTrackToken ||
      identifier === orderTrackToken;
    if (tokenMatch) {
      return { allowed: true, mode: 'track_token' };
    }
  }

  // Authenticated user looking up by UUID when they own the order
  if (user?.type === 'user' && identifier === order.id && order.userId === user.sub) {
    return { allowed: true, mode: 'owner' };
  }

  return {
    allowed: false,
    reason: 'Valid track token or account sign-in required',
  };
}

/** Strip PII and sensitive fields from order payloads for public track-token viewers. */
export function toPublicOrderView<T extends Record<string, unknown>>(order: T): T {
  const {
    guestPhone: _guestPhone,
    guestEmail: _guestEmail,
    guestName: _guestName,
    deliveryCode: _deliveryCode,
    deliveryAddressLine: _deliveryAddressLine,
    deliveryCity: _deliveryCity,
    deliveryDistrict: _deliveryDistrict,
    deliveryLat: _deliveryLat,
    deliveryLng: _deliveryLng,
    paymentFailureReason: _paymentFailureReason,
    trackToken: _trackToken,
    user: _user,
    address: _address,
    refund: _refund,
    ...safe
  } = order as T & {
    guestPhone?: unknown;
    guestEmail?: unknown;
    guestName?: unknown;
    deliveryCode?: unknown;
    deliveryAddressLine?: unknown;
    deliveryCity?: unknown;
    deliveryDistrict?: unknown;
    deliveryLat?: unknown;
    deliveryLng?: unknown;
    paymentFailureReason?: unknown;
    trackToken?: unknown;
    user?: unknown;
    address?: unknown;
    refund?: unknown;
  };

  return stripStaffAttribution(safe as T);
}

export function buildOrderTrackPath(trackToken: string): string {
  return `/order/${encodeURIComponent(trackToken)}`;
}

export function readTrackToken(req: Request): string | null {
  const fromQuery = req.query?.t ?? req.query?.trackToken;
  if (typeof fromQuery === 'string' && fromQuery.trim()) return fromQuery.trim();
  const body = req.body as { trackToken?: string } | undefined;
  if (typeof body?.trackToken === 'string' && body.trackToken.trim()) return body.trackToken.trim();
  return null;
}

export function orderIdentifierWhere(identifier: string) {
  return {
    OR: [
      { id: identifier },
      { orderNumber: identifier },
      { trackToken: identifier },
    ],
  };
}
