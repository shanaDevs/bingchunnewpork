import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    cart: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('../../src/services/inventoryReservationService', () => ({
  createCheckoutReservation: vi.fn(),
  InsufficientStockError: class InsufficientStockError extends Error {},
}));

import { createCheckoutReservation } from '../../src/services/inventoryReservationService';
import { startCheckoutWithReservation } from '../../src/services/checkoutReservationService';

describe('checkoutReservationService integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a checkout reservation session', async () => {
    vi.mocked(createCheckoutReservation).mockResolvedValue({
      reservationUuid: 'uuid-1',
      expiresAt: new Date('2026-08-05T10:15:00Z'),
      ttlMinutes: 10,
      items: [{ productId: 'p1', quantity: 2 }],
    });

    const result = await startCheckoutWithReservation({
      storeId: 'store-1',
      items: [{ productId: 'p1', quantity: 2 }],
      userId: 'user-1',
    });

    expect(result.reservationUuid).toBe('uuid-1');
    expect(createCheckoutReservation).toHaveBeenCalled();
  });
});
