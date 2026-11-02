import { describe, expect, it } from 'vitest';
import { mergeStoreOrderingHours } from '../../src/lib/storeOrderingSchema';

describe('storeOrderingSchema mergeStoreOrderingHours', () => {
  const store = { id: 's1', openTime: '09:00', closeTime: '23:00', name: 'Branch' };

  it('fills defaults when hours map entry is missing', () => {
    expect(mergeStoreOrderingHours(store, null)).toEqual({
      ...store,
      onlineOrderStartTime: null,
      onlineOrderStopTime: null,
      pickupCutoffMinutes: 50,
    });
  });

  it('merges fetched ordering hours onto the store row', () => {
    expect(
      mergeStoreOrderingHours(store, {
        openTime: '08:00',
        closeTime: '22:00',
        onlineOrderStartTime: '08:30',
        onlineOrderStopTime: '21:30',
        pickupCutoffMinutes: 45,
      }),
    ).toMatchObject({
      id: 's1',
      onlineOrderStartTime: '08:30',
      pickupCutoffMinutes: 45,
    });
  });
});
