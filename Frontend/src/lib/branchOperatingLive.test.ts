import { describe, expect, it } from 'vitest';
import {
  patchFulfillmentBranchClosedAt,
  patchFulfillmentOperating,
  sameBranchClosedAt,
} from './branchOperatingLive';

const takeaway = {
  storeId: 'store-1',
  storeName: 'Nugegoda',
  openTime: '08:00',
  closeTime: '23:00',
  onlineOrderStartTime: '08:00',
  onlineOrderStopTime: '23:00',
  pickupCutoffMinutes: 50,
  branchClosedAt: null as string | null,
};

const delivery = {
  ...takeaway,
  zoneId: 'zone-1',
  fee: 150,
  minOrder: 500,
  estimatedMinutes: 35,
  address: '1 Main St',
};

describe('patchFulfillmentBranchClosedAt', () => {
  it('sets branchClosedAt for the selected store without changing hours or cutoff', () => {
    const closedAt = '2026-11-12T10:00:00.000Z';
    const next = patchFulfillmentBranchClosedAt(takeaway, 'store-1', closedAt);
    expect(next).toEqual({ ...takeaway, branchClosedAt: closedAt });
    expect(next?.openTime).toBe('08:00');
    expect(next?.pickupCutoffMinutes).toBe(50);
  });

  it('ignores a different store', () => {
    expect(patchFulfillmentBranchClosedAt(takeaway, 'store-2', '2026-11-12T10:00:00.000Z')).toBe(takeaway);
  });

  it('returns the same object when the closed timestamp is already applied', () => {
    const closed = { ...takeaway, branchClosedAt: '2026-11-12T10:00:00.000Z' };
    expect(patchFulfillmentBranchClosedAt(closed, 'store-1', '2026-11-12T10:00:00.000Z')).toBe(closed);
  });

  it('clears branchClosedAt when the branch reopens', () => {
    const closed = { ...takeaway, branchClosedAt: '2026-11-12T10:00:00.000Z' };
    expect(patchFulfillmentBranchClosedAt(closed, 'store-1', null)).toEqual({
      ...takeaway,
      branchClosedAt: null,
    });
  });
});

describe('patchFulfillmentOperating', () => {
  it('updates online stop time without changing delivery fee or min order', () => {
    const next = patchFulfillmentOperating(delivery, {
      storeId: 'store-1',
      onlineOrderStopTime: '12:00',
    });
    expect(next?.onlineOrderStopTime).toBe('12:00');
    expect(next?.fee).toBe(150);
    expect(next?.minOrder).toBe(500);
    expect(next?.estimatedMinutes).toBe(35);
    expect(next?.address).toBe('1 Main St');
    expect(next?.pickupCutoffMinutes).toBe(50);
  });

  it('does not rewrite hours when the payload only includes branchClosedAt', () => {
    const next = patchFulfillmentOperating(delivery, {
      storeId: 'store-1',
      branchClosedAt: '2026-11-12T10:00:00.000Z',
    });
    expect(next?.onlineOrderStartTime).toBe('08:00');
    expect(next?.onlineOrderStopTime).toBe('23:00');
    expect(next?.fee).toBe(150);
  });
});

describe('sameBranchClosedAt', () => {
  it('treats null and undefined as open', () => {
    expect(sameBranchClosedAt(null, undefined)).toBe(true);
    expect(sameBranchClosedAt('2026-11-12T10:00:00.000Z', null)).toBe(false);
  });
});
