import { api } from '@/lib/api';

export type CheckoutReservationLine = {
  productId: string;
  quantity: number;
  productName?: string;
};

export type CheckoutReservationSession = {
  reservationUuid: string;
  expiresAt: string;
  ttlMinutes: number;
};

export function isCheckoutReservationActive(
  reservationUuid?: string | null,
  reservationExpiresAt?: string | null,
): boolean {
  if (!reservationUuid || !reservationExpiresAt) return false;
  return new Date(reservationExpiresAt).getTime() > Date.now();
}

export async function startCheckoutReservation(
  storeId: string,
  items: CheckoutReservationLine[],
  reservationUuid?: string | null,
  useAuth = true,
  reservationExpiresAt?: string | null,
): Promise<CheckoutReservationSession> {
  const canRenew = isCheckoutReservationActive(reservationUuid, reservationExpiresAt);

  return api.post<CheckoutReservationSession>(
    '/inventory/checkout',
    {
      storeId,
      items,
      ...(canRenew && reservationUuid ? { reservationUuid, renewExisting: true } : {}),
    },
    useAuth,
  );
}

export async function cancelCheckoutReservation(
  reservationUuid: string,
): Promise<void> {
  await api.delete(`/inventory/reservations/${encodeURIComponent(reservationUuid)}`);
}
