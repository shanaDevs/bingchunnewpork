import { describe, expect, it, vi, afterEach } from 'vitest';
import { deliveryAdminViaCore, resolveAdminRequestUrl } from './deliveryApi';

describe('deliveryAdminViaCore', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to core (shop)', () => {
    expect(deliveryAdminViaCore()).toBe(true);
  });

  it('uses core when NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE is true', () => {
    vi.stubEnv('NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE', 'true');
    expect(deliveryAdminViaCore()).toBe(true);
  });

  it('opts out only when explicitly false', () => {
    vi.stubEnv('NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE', 'false');
    expect(deliveryAdminViaCore()).toBe(false);
  });
});

describe('resolveAdminRequestUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('routes delivery-jobs through shop/core by default', () => {
    const url = resolveAdminRequestUrl(
      '/admin/delivery-jobs/abc123/actual-route?storeId=store-1',
    );
    expect(url).toContain('/api/admin/delivery-jobs/abc123/actual-route?storeId=store-1');
    expect(url).not.toContain('/delivery-api/');
  });

  it('routes delivery-jobs list through shop/core by default', () => {
    const url = resolveAdminRequestUrl('/admin/delivery-jobs?status=COMPLETED');
    expect(url).toContain('/api/admin/delivery-jobs?status=COMPLETED');
    expect(url).not.toContain('/delivery-api/');
  });

  it('can still use delivery-api when via-core is opted out', () => {
    vi.stubEnv('NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE', 'false');
    expect(resolveAdminRequestUrl('/admin/delivery-jobs?status=COMPLETED')).toBe(
      '/delivery-api/admin/delivery-jobs?status=COMPLETED',
    );
  });
});
