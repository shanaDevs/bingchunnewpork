import { createIndexIfMissing } from './schemaPatch';

let ensured = false;

/** Runtime bootstrap when Prisma migrate has not run yet. */
export async function ensureInventoryReservationSchema(): Promise<void> {
  if (ensured) return;

  await createIndexIfMissing('store_product_reservations', 'idx_reservation_uuid', '`reservationUuid`');
  await createIndexIfMissing(
    'store_product_reservations',
    'idx_reservation_store_product_status',
    '`storeId`, `productId`, `status`',
  );
  await createIndexIfMissing(
    'store_product_reservations',
    'idx_reservation_status_expires',
    '`status`, `expiresAt`',
  );
  await createIndexIfMissing(
    'store_product_reservations',
    'idx_reservation_user_status',
    '`userId`, `status`',
  );
  await createIndexIfMissing('store_product_reservations', 'idx_reservation_order', '`orderId`');

  ensured = true;
}

export const RESERVATION_TTL_MINUTES = 10;
export const RESERVATION_MAX_SESSION_MINUTES = 30;
export const RESERVATION_MAX_LINE_QUANTITY = 50;

export type ReservationStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

export type ReservationLineInput = {
  productId: string;
  quantity: number;
  productName?: string;
};

export type ReservationRow = {
  id: string;
  reservationUuid: string;
  userId: string | null;
  cartId: string | null;
  storeId: string;
  productId: string;
  quantity: number;
  orderId: string | null;
  status: ReservationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};
