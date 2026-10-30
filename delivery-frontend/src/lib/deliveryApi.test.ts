import { describe, expect, it, vi, afterEach } from 'vitest';
import { deliveryAdminViaCore, resolveAdminRequestUrl } from './deliveryApi';

describe('deliveryAdminViaCore', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses core when NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE is true', () => {
    vi.stubEnv('NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE', 'true');
    expect(deliveryAdminViaCore()).toBe(true);
  });
});

describe('resolveAdminRequestUrl', () => {
  it('routes delivery-jobs actual-route through delivery-api', () => {
    const url = resolveAdminRequestUrl(
      '/admin/delivery-jobs/abc123/actual-route?storeId=store-1',
    );
    expect(url).toBe('/delivery-api/admin/delivery-jobs/abc123/actual-route?storeId=store-1');
  });

  it('routes delivery-jobs list through delivery-api', () => {
    expect(resolveAdminRequestUrl('/admin/delivery-jobs?status=COMPLETED')).toBe(
      '/delivery-api/admin/delivery-jobs?status=COMPLETED',
    );
  });
});
