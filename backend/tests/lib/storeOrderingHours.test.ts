import { describe, expect, it } from 'vitest';
import {
  branchManuallyClosedMessage,
  customerOnlineOrderingClosedMessage,
  isBranchManuallyClosed,
  isCustomerOnlineOrderingOpen,
} from '../../src/lib/storeOrderingHours';

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
