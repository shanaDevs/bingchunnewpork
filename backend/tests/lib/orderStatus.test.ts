import { describe, expect, it } from 'vitest';
import {
  allowedStatusOptions,
  assertValidStatusTransition,
  INITIAL_ORDER_STATUS,
  statusFlowForMode,
} from '../../src/lib/orderStatus';

describe('INITIAL_ORDER_STATUS', () => {
  it('is RECEIVED', () => {
    expect(INITIAL_ORDER_STATUS).toBe('RECEIVED');
  });
});

describe('statusFlowForMode', () => {
  it('includes out-for-delivery only for delivery orders', () => {
    expect(statusFlowForMode('DELIVERY')).toEqual([
      'RECEIVED',
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
    expect(statusFlowForMode('TAKEAWAY')).toEqual([
      'RECEIVED',
      'PREPARING',
      'READY',
      'DELIVERED',
    ]);
  });
});

describe('allowedStatusOptions', () => {
  it('returns only current status for terminal states', () => {
    expect(allowedStatusOptions('DELIVERED', 'DELIVERY')).toEqual(['DELIVERED']);
    expect(allowedStatusOptions('CANCELLED', 'TAKEAWAY')).toEqual(['CANCELLED']);
  });

  it('returns forward flow plus cancel from current step', () => {
    expect(allowedStatusOptions('PREPARING', 'DELIVERY')).toEqual([
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED',
    ]);
    expect(allowedStatusOptions('READY', 'TAKEAWAY')).toEqual([
      'READY',
      'DELIVERED',
      'CANCELLED',
    ]);
  });

  it('returns only current status when status is unknown in flow', () => {
    expect(allowedStatusOptions('OUT_FOR_DELIVERY', 'TAKEAWAY')).toEqual(['OUT_FOR_DELIVERY']);
  });
});

describe('assertValidStatusTransition', () => {
  it('rejects no-op transitions', () => {
    expect(() =>
      assertValidStatusTransition({ status: 'PREPARING', orderMode: 'DELIVERY' }, 'PREPARING'),
    ).toThrow('Order is already in this status');
  });

  it('rejects changes from completed orders', () => {
    expect(() =>
      assertValidStatusTransition({ status: 'DELIVERED', orderMode: 'DELIVERY' }, 'CANCELLED'),
    ).toThrow('Cannot change status of a completed order');
  });

  it('allows cancellation from any active status', () => {
    expect(() =>
      assertValidStatusTransition({ status: 'PREPARING', orderMode: 'DELIVERY' }, 'CANCELLED'),
    ).not.toThrow();
  });

  it('allows forward transitions within the mode flow', () => {
    expect(() =>
      assertValidStatusTransition({ status: 'PREPARING', orderMode: 'DELIVERY' }, 'READY'),
    ).not.toThrow();
    expect(() =>
      assertValidStatusTransition({ status: 'READY', orderMode: 'TAKEAWAY' }, 'DELIVERED'),
    ).not.toThrow();
  });

  it('rejects invalid status for order type', () => {
    expect(() =>
      assertValidStatusTransition({ status: 'READY', orderMode: 'TAKEAWAY' }, 'OUT_FOR_DELIVERY'),
    ).toThrow('Invalid status for this order type');
  });

  it('rejects backward transitions', () => {
    expect(() =>
      assertValidStatusTransition({ status: 'READY', orderMode: 'DELIVERY' }, 'PREPARING'),
    ).toThrow('Cannot revert order to a previous status');
  });
});
