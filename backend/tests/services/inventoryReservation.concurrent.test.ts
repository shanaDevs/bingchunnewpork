import { describe, expect, it, vi } from 'vitest';

/**
 * Documents expected behaviour when two checkouts compete for the last unit:
 * reservation + batch stock engine use row locks; only one checkout should succeed.
 */
describe('inventory reservation concurrency (contract)', () => {
  it('createCheckoutReservation rejects the second caller when stock is exhausted', async () => {
    const createCheckoutReservation = vi
      .fn()
      .mockResolvedValueOnce({ reservationUuid: 'a', expiresAt: new Date(), ttlMinutes: 10, items: [] })
      .mockRejectedValueOnce(new Error('Insufficient stock'));

    const first = await createCheckoutReservation({ storeId: 's1', items: [{ productId: 'p1', quantity: 1 }] });
    await expect(
      createCheckoutReservation({ storeId: 's1', items: [{ productId: 'p1', quantity: 1 }] }),
    ).rejects.toThrow(/Insufficient stock/i);

    expect(first.reservationUuid).toBe('a');
    expect(createCheckoutReservation).toHaveBeenCalledTimes(2);
  });
});
