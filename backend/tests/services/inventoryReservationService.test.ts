import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  renewReservationSession,
  findActiveReservationsByUuid,
  createReservationSession,
  expireStaleReservations,
  InsufficientStockError,
} = vi.hoisted(() => ({
  renewReservationSession: vi.fn(),
  findActiveReservationsByUuid: vi.fn(),
  createReservationSession: vi.fn(),
  expireStaleReservations: vi.fn(),
  InsufficientStockError: class InsufficientStockError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'InsufficientStockError';
    }
  },
}));

vi.mock('../../src/repositories/inventoryReservationRepository', () => ({
  InsufficientStockError,
  renewReservationSession,
  findActiveReservationsByUuid,
  createReservationSession,
  expireStaleReservations,
}));

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import {
  createCheckoutReservation,
  releaseExpiredReservations,
} from '../../src/services/inventoryReservationService';

describe('createCheckoutReservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a fresh hold when renewExisting targets an expired session', async () => {
    findActiveReservationsByUuid.mockResolvedValue([]);
    createReservationSession.mockResolvedValue({
      reservationUuid: 'uuid-new',
      expiresAt: new Date('2026-08-05T10:15:00Z'),
      rows: [{ productId: 'p1', quantity: 2 }],
    });

    const result = await createCheckoutReservation({
      storeId: 'store-1',
      items: [{ productId: 'p1', quantity: 2 }],
      reservationUuid: 'uuid-stale',
      renewExisting: true,
    });

    expect(result.reservationUuid).toBe('uuid-new');
    expect(renewReservationSession).not.toHaveBeenCalled();
    expect(createReservationSession).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        reservationUuid: 'uuid-stale',
        replaceExistingUuid: 'uuid-stale',
      }),
    );
  });

  it('renews TTL only when cart items still match the hold', async () => {
    findActiveReservationsByUuid.mockResolvedValue([
      { productId: 'p1', quantity: 2, storeId: 'store-1' },
    ]);
    renewReservationSession.mockResolvedValue({
      reservationUuid: 'uuid-1',
      expiresAt: new Date('2026-08-05T10:15:00Z'),
    });

    const result = await createCheckoutReservation({
      storeId: 'store-1',
      items: [{ productId: 'p1', quantity: 2 }],
      reservationUuid: 'uuid-1',
      renewExisting: true,
    });

    expect(result.reservationUuid).toBe('uuid-1');
    expect(renewReservationSession).toHaveBeenCalledWith('uuid-1', expect.any(Date));
    expect(createReservationSession).not.toHaveBeenCalled();
  });

  it('replaces the hold when cart products/qty changed', async () => {
    findActiveReservationsByUuid.mockResolvedValue([
      { productId: 'p-old', quantity: 1, storeId: 'store-1' },
    ]);
    createReservationSession.mockResolvedValue({
      reservationUuid: 'uuid-1',
      expiresAt: new Date('2026-08-05T10:15:00Z'),
      rows: [{ productId: 'p-new', quantity: 1 }],
    });

    const result = await createCheckoutReservation({
      storeId: 'store-1',
      items: [{ productId: 'p-new', quantity: 1 }],
      reservationUuid: 'uuid-1',
      renewExisting: true,
    });

    expect(result.reservationUuid).toBe('uuid-1');
    expect(renewReservationSession).not.toHaveBeenCalled();
    expect(createReservationSession).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ productId: 'p-new', quantity: 1 }],
        replaceExistingUuid: 'uuid-1',
      }),
    );
  });
});

describe('releaseExpiredReservations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns count of expired reservations', async () => {
    vi.mocked(expireStaleReservations).mockResolvedValue(3);
    const count = await releaseExpiredReservations();
    expect(count).toBe(3);
  });
});
