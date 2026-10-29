import { describe, expect, it } from 'vitest';
import { resolveAdminRequestUrl } from './deliveryApi';

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
