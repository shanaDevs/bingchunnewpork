import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import {
  createCheckoutReservation,
  getReservationStatus,
  handlePaymentFailure,
  handlePaymentSuccess,
  InsufficientStockError,
  type ReservationItemInput,
} from './inventoryReservationService';

export type CheckoutReservationInput = {
  storeId: string;
  items: ReservationItemInput[];
  userId?: string | null;
  reservationUuid?: string;
  renewExisting?: boolean;
  channel?: import('../repositories/inventoryReservationRepository').ReservationStockChannel;
};

/** Checkout entry point — validate stock and hold inventory for 10 minutes. */
export async function startCheckoutWithReservation(input: CheckoutReservationInput) {
  let cartId: string | null = null;
  if (input.userId) {
    const cart = await prisma.cart.findUnique({
      where: { userId: input.userId },
      select: { id: true, storeId: true },
    });
    cartId = cart?.id ?? null;
    if (cart?.storeId && cart.storeId !== input.storeId) {
      throw new AppError('Cart belongs to a different branch', 400);
    }
  }

  try {
    return await createCheckoutReservation({
      storeId: input.storeId,
      items: input.items,
      userId: input.userId,
      cartId,
      reservationUuid: input.reservationUuid,
      renewExisting: input.renewExisting,
      channel: input.channel,
    });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      throw new AppError(err.message, 409);
    }
    throw err;
  }
}

export async function finalizePaidCheckout(input: {
  orderId: string;
  storeId: string;
}) {
  await handlePaymentSuccess(input);
}

export async function abortCheckoutReservation(input: {
  orderId?: string;
  reservationUuid?: string;
}) {
  await handlePaymentFailure(input);
}

export async function readCheckoutReservationStatus(reservationUuid: string, callerId: string) {
  const status = await getReservationStatus(reservationUuid, callerId);
  if (!status) throw new AppError('Reservation not found', 404);
  return status;
}
