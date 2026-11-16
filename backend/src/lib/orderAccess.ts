import { randomBytes } from 'crypto';
import type { Request } from 'express';
import type { JwtPayload } from '../middleware/auth';
import { isSocialPlaceholderPhone, phoneLookupVariants } from '../utils/phone';
import { stripStaffAttribution } from './orderActor';

export function generateTrackToken(): string {
  return randomBytes(32).toString('base64url');
}

type OrderAccessRow = {
  id: string;
  orderNumber: string;
  trackToken: string | null;
  userId: string | null;
  /** Present for unclaimed guest checkouts; used with callerPhoneVariants. */
  guestPhone?: string | null;
};

export type OrderAccessResult =
  | { allowed: true; mode: 'admin' | 'owner' | 'track_token' }
  | { allowed: false; reason: string };

function normalizeToken(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Phone variants for the signed-in customer (same set as GET /orders/my). */
export function callerPhoneVariantsFor(phone: string | null | undefined): string[] {
  if (!phone || isSocialPlaceholderPhone(phone)) return [];
  return phoneLookupVariants(phone);
}

/**
 * Resolve whether the caller may access an order.
 * Public/guest access requires the unguessable track token — not the order number alone.
 * Signed-in customers may also open unclaimed guest orders that match their phone
 * (aligned with getMyOrders).
 */
export function resolveOrderAccess(opts: {
  order: OrderAccessRow;
  identifier: string;
  trackToken?: string | null;
  user?: JwtPayload;
  /** From callerPhoneVariantsFor(user.phone) — required for guest-phone ownership. */
  callerPhoneVariants?: string[];
}): OrderAccessResult {
  const { order, identifier, user } = opts;
  const trackToken = normalizeToken(opts.trackToken);

  if (user?.type === 'admin' && user.role !== 'DELIVERY_DRIVER') {
    return { allowed: true, mode: 'admin' };
  }

  if (user?.type === 'user' && order.userId && order.userId === user.sub) {
    return { allowed: true, mode: 'owner' };
  }

  // Same rule as getMyOrders: unclaimed guest orders whose guestPhone matches the account.
  if (
    user?.type === 'user' &&
    !order.userId &&
    order.guestPhone &&
    opts.callerPhoneVariants &&
    opts.callerPhoneVariants.length > 0
  ) {
    const guest = order.guestPhone.trim();
    if (guest && opts.callerPhoneVariants.includes(guest)) {
      return { allowed: true, mode: 'owner' };
    }
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
    actualDropoffLat: _actualDropoffLat,
    actualDropoffLng: _actualDropoffLng,
    actualDropoffAt: _actualDropoffAt,
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
    actualDropoffLat?: unknown;
    actualDropoffLng?: unknown;
    actualDropoffAt?: unknown;
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

/** Load phone variants for a customer account (used when resolving guest-order ownership). */
export async function loadCallerPhoneVariants(userId: string): Promise<string[]> {
  const { prisma } = await import('./prisma');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  });
  return callerPhoneVariantsFor(user?.phone);
}

/**
 * Same as resolveOrderAccess, but loads the caller's phone variants when the order
 * is an unclaimed guest checkout (so profile /orders?ref= works without a track token).
 */
export async function resolveCustomerOrderAccess(opts: {
  order: OrderAccessRow;
  identifier: string;
  trackToken?: string | null;
  user?: JwtPayload;
}): Promise<OrderAccessResult> {
  let callerPhoneVariants: string[] | undefined;
  if (opts.user?.type === 'user' && !opts.order.userId && opts.order.guestPhone) {
    callerPhoneVariants = await loadCallerPhoneVariants(opts.user.sub);
  }
  return resolveOrderAccess({ ...opts, callerPhoneVariants });
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
