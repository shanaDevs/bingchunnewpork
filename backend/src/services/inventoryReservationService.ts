import {
  RESERVATION_MAX_SESSION_MINUTES,
  RESERVATION_TTL_MINUTES,
} from '../lib/inventoryReservationSchema';
import { AppError } from '../middleware/errorHandler';
import {
  InsufficientStockError,
  attachOrderToReservations,
  cancelReservationsByUuid,
  cancelReservationsForOrder,
  completeReservationsForOrder,
  createReservationSession,
  expireStaleReservations,
  findActiveReservationsByUuid,
  findReservationsByUuid,
  getAvailableStock,
  getAvailableStockBatch,
  renewReservationSession,
  type ReservationStockChannel,
} from '../repositories/inventoryReservationRepository';
import { deductOrderItemsOnce } from '../lib/stockEngine';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

export { InsufficientStockError };

export type ReservationItemInput = {
  productId: string;
  quantity: number;
  productName?: string;
};

function aggregateReservationQty(
  items: Array<{ productId: string; quantity: number }>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (item.quantity <= 0) continue;
    totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  }
  return totals;
}

/** True when reserved lines match the current cart (product + qty). */
function reservationMatchesCart(
  reserved: Array<{ productId: string; quantity: number; storeId?: string }>,
  requested: ReservationItemInput[],
  storeId: string,
): boolean {
  if (reserved.length === 0) return false;
  if (reserved.some((row) => row.storeId && row.storeId !== storeId)) return false;

  const held = aggregateReservationQty(reserved);
  const wanted = aggregateReservationQty(requested);
  if (held.size !== wanted.size) return false;

  for (const [productId, qty] of wanted) {
    if ((held.get(productId) ?? 0) !== qty) return false;
  }
  return true;
}

export function reservationExpiryDate(from = new Date()): Date {
  return new Date(from.getTime() + RESERVATION_TTL_MINUTES * 60_000);
}

export async function getStockAvailability(storeId: string, productId: string, reservationUuid?: string) {
  const [physicalRow, available] = await Promise.all([
    prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId, productId } },
      select: { stock: true, isAvailable: true, weeklyRemainingQty: true },
    }),
    getAvailableStock(storeId, productId, reservationUuid),
  ]);

  return {
    storeId,
    productId,
    physicalStock: physicalRow?.stock ?? 0,
    availableStock: available,
    isAvailable: Boolean(physicalRow?.isAvailable),
    weeklyRemainingQty: physicalRow?.weeklyRemainingQty ?? 0,
    reservedQuantity: Math.max(0, (physicalRow?.stock ?? 0) - available),
  };
}

function isStaleReservationError(err: unknown): boolean {
  return err instanceof InsufficientStockError && err.message === 'Reservation expired or not found';
}

export async function createCheckoutReservation(input: {
  storeId: string;
  items: ReservationItemInput[];
  userId?: string | null;
  cartId?: string | null;
  reservationUuid?: string;
  renewExisting?: boolean;
  channel?: ReservationStockChannel;
}) {
  const expiresAt = reservationExpiryDate();
  const channel = input.channel ?? 'WEB';

  // Only extend TTL when the existing hold still matches the current cart.
  // Otherwise replace the hold — renewing alone left stale product/qty rows and
  // caused "Reservation quantities changed" at place-order.
  if (input.renewExisting && input.reservationUuid) {
    try {
      const existing = await findActiveReservationsByUuid(input.reservationUuid);
      const sessionStart = existing[0]?.createdAt;
      if (
        sessionStart &&
        Date.now() - sessionStart.getTime() > RESERVATION_MAX_SESSION_MINUTES * 60_000
      ) {
        throw new InsufficientStockError('Checkout session expired — please restart');
      }
      if (reservationMatchesCart(existing, input.items, input.storeId)) {
        const renewed = await renewReservationSession(input.reservationUuid, expiresAt);
        return {
          reservationUuid: renewed.reservationUuid,
          expiresAt: renewed.expiresAt,
          ttlMinutes: RESERVATION_TTL_MINUTES,
          items: existing.map((row) => ({
            productId: row.productId,
            quantity: row.quantity,
          })),
        };
      }
    } catch (err) {
      if (!isStaleReservationError(err)) throw err;
      // Stale client session — fall through and create a fresh hold.
    }
  }

  const session = await createReservationSession({
    storeId: input.storeId,
    items: input.items,
    userId: input.userId,
    cartId: input.cartId,
    reservationUuid: input.reservationUuid,
    expiresAt,
    replaceExistingUuid: input.reservationUuid,
    channel,
  });

  return {
    reservationUuid: session.reservationUuid,
    expiresAt: session.expiresAt,
    ttlMinutes: RESERVATION_TTL_MINUTES,
    items: session.rows.map((row) => ({
      productId: row.productId,
      quantity: row.quantity,
    })),
  };
}

export async function getReservationStatus(reservationUuid: string, callerId: string) {
  const rows = await findReservationsByUuid(reservationUuid);
  if (rows.length === 0) return null;

  const ownerId = rows[0].userId;
  if (!ownerId || ownerId !== callerId) {
    throw new AppError('Forbidden', 403);
  }

  const active = rows.filter((row) => row.status === 'ACTIVE' && row.expiresAt > new Date());
  const expiresAt = active[0]?.expiresAt ?? rows[0].expiresAt;
  const status = active.length > 0 ? 'ACTIVE' : rows[0].status;

  return {
    reservationUuid,
    status,
    expiresAt,
    orderId: rows.find((row) => row.orderId)?.orderId ?? null,
    storeId: rows[0].storeId,
    items: rows.map((row) => ({
      productId: row.productId,
      quantity: row.quantity,
      status: row.status,
    })),
    secondsRemaining: active.length > 0 ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) : 0,
  };
}

export async function validateAndLinkReservationToOrder(input: {
  reservationUuid: string;
  orderId: string;
  storeId: string;
  items: ReservationItemInput[];
}) {
  await attachOrderToReservations(input.reservationUuid, input.orderId, input.storeId, input.items);
}

export async function handlePaymentSuccess(input: {
  orderId: string;
  storeId: string;
}): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { items: true },
  });
  if (!order) throw new AppError('Order not found', 404);
  if (order.storeId !== input.storeId) {
    throw new AppError('Order store mismatch', 400);
  }

  const deductLines = order.items
    .filter((item) => item.quantity > 0)
    .map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      orderItemId: item.id,
    }));

  await prisma.$transaction(async () => {
    await completeReservationsForOrder(input.orderId);
    if (deductLines.length > 0) {
      await deductOrderItemsOnce(input.storeId, deductLines, input.orderId);
    }
  });
}

export async function handlePaymentFailure(input: {
  orderId?: string;
  reservationUuid?: string;
}): Promise<void> {
  if (input.orderId) {
    await cancelReservationsForOrder(input.orderId);
    return;
  }
  if (input.reservationUuid) {
    await cancelReservationsByUuid(input.reservationUuid);
  }
}

export async function releaseExpiredReservations(): Promise<number> {
  const count = await expireStaleReservations();
  if (count > 0) {
    logger.info(`Released ${count} expired inventory reservation(s)`);
  }
  return count;
}

export async function cancelReservation(reservationUuid: string, callerId: string): Promise<number> {
  const rows = await findActiveReservationsByUuid(reservationUuid);
  if (rows.length === 0) {
    const any = await findReservationsByUuid(reservationUuid);
    if (any.length === 0) throw new AppError('Reservation not found', 404);
    return 0;
  }

  const ownerId = rows[0].userId;
  if (!ownerId || ownerId !== callerId) {
    throw new AppError('Forbidden', 403);
  }

  return cancelReservationsByUuid(reservationUuid);
}

export async function getBatchAvailability(storeId: string, productIds: string[], reservationUuid?: string) {
  const availability = await getAvailableStockBatch(storeId, productIds, reservationUuid);
  return productIds.map((productId) => ({
    storeId,
    productId,
    availableStock: availability[productId] ?? 0,
  }));
}
