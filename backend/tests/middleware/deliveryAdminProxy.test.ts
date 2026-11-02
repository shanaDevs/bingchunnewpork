import { describe, expect, it } from 'vitest';
import { isAdminDeliveryServicePath } from '../../src/middleware/deliveryAdminProxy';

describe('isAdminDeliveryServicePath', () => {
  it('matches delivery dispatch and jobs', () => {
    expect(isAdminDeliveryServicePath('/delivery/pending-orders')).toBe(true);
    expect(isAdminDeliveryServicePath('/delivery-jobs')).toBe(true);
    expect(isAdminDeliveryServicePath('/delivery-jobs/abc/live-route')).toBe(true);
  });

  it('matches wallet and store access', () => {
    expect(isAdminDeliveryServicePath('/delivery-wallet/payouts')).toBe(true);
    expect(isAdminDeliveryServicePath('/stores/delivery-access')).toBe(true);
    expect(isAdminDeliveryServicePath('/stores/store-1/delivery-access')).toBe(true);
  });

  it('does not match unrelated admin routes', () => {
    expect(isAdminDeliveryServicePath('/wallet')).toBe(false);
    expect(isAdminDeliveryServicePath('/orders')).toBe(false);
    expect(isAdminDeliveryServicePath('/stock')).toBe(false);
  });
});
