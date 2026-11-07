import { describe, expect, it } from 'vitest';
import {
  isPickupOnlyBranchAdmin,
  storeSupportsDelivery,
  type AdminSession,
} from '@/lib/adminAuth';

const branchAdmin = (deliveryEnabled?: boolean | null): AdminSession => ({
  id: '1',
  name: 'Branch',
  email: 'b@example.com',
  role: 'STORE_MANAGER',
  storeId: 'store-1',
  deliveryEnabled,
});

describe('storeSupportsDelivery', () => {
  it('treats HQ roles as delivery-capable', () => {
    expect(
      storeSupportsDelivery({
        id: '1',
        name: 'Admin',
        email: 'a@example.com',
        role: 'SYSTEM_ADMIN',
      }),
    ).toBe(true);
  });

  it('returns false only when deliveryEnabled is explicitly false', () => {
    expect(storeSupportsDelivery(branchAdmin(false))).toBe(false);
  });

  it('returns true when deliveryEnabled is true', () => {
    expect(storeSupportsDelivery(branchAdmin(true))).toBe(true);
  });

  it('returns true when deliveryEnabled is unknown (null/undefined)', () => {
    expect(storeSupportsDelivery(branchAdmin(undefined))).toBe(true);
    expect(storeSupportsDelivery(branchAdmin(null))).toBe(true);
  });
});

describe('isPickupOnlyBranchAdmin', () => {
  it('is true only for branch scoped users with deliveryEnabled false', () => {
    expect(isPickupOnlyBranchAdmin(branchAdmin(false))).toBe(true);
    expect(isPickupOnlyBranchAdmin(branchAdmin(true))).toBe(false);
    expect(isPickupOnlyBranchAdmin(branchAdmin(undefined))).toBe(false);
    expect(isPickupOnlyBranchAdmin(branchAdmin(null))).toBe(false);
  });
});
