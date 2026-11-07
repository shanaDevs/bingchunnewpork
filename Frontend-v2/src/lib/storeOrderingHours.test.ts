import { describe, expect, it } from 'vitest';
import {
  branchManuallyClosedMessage,
  customerOnlineOrderingClosedMessage,
  isBranchManuallyClosed,
  isCustomerOnlineOrderingOpen,
  orderingConfigFromFulfillment,
  resolveStoreOrderingHours,
} from './storeOrderingHours';

const hours = {
  openTime: '09:00',
  closeTime: '23:00',
  onlineOrderStartTime: '00:00',
  onlineOrderStopTime: '23:59',
};

describe('storeOrderingHours manual branch close', () => {
  it('detects manual close from branchClosedAt', () => {
    expect(isBranchManuallyClosed({ branchClosedAt: null })).toBe(false);
    expect(isBranchManuallyClosed({ branchClosedAt: '2026-10-06T12:00:00.000Z' })).toBe(true);
  });

  it('blocks customer ordering when manually closed', () => {
    const noon = new Date('2026-10-06T12:00:00.000Z');
    expect(
      isCustomerOnlineOrderingOpen({ ...hours, branchClosedAt: new Date('2026-10-06T10:00:00.000Z') }, noon),
    ).toBe(false);
    expect(customerOnlineOrderingClosedMessage({ ...hours, branchClosedAt: new Date() })).toBe(
      branchManuallyClosedMessage(),
    );
  });
});

describe('resolveStoreOrderingHours', () => {
  it('uses schedule close as earlier of store close and online stop', () => {
    const resolved = resolveStoreOrderingHours({
      openTime: '09:00',
      closeTime: '22:00',
      onlineOrderStartTime: '10:00',
      onlineOrderStopTime: '21:00',
    });
    expect(resolved.scheduleCloseTime).toBe('21:00');
  });
});

describe('orderingConfigFromFulfillment', () => {
  it('returns null when fulfillment info is missing', () => {
    expect(orderingConfigFromFulfillment(null)).toBeNull();
  });

  it('maps fulfillment fields and defaults', () => {
    expect(
      orderingConfigFromFulfillment({
        storeId: 's1',
        storeName: 'Branch',
        openTime: '08:00',
        closeTime: '20:00',
        branchClosedAt: null,
      }),
    ).toEqual({
      openTime: '08:00',
      closeTime: '20:00',
      onlineOrderStartTime: undefined,
      onlineOrderStopTime: undefined,
      pickupCutoffMinutes: undefined,
      branchClosedAt: null,
    });
  });
});
