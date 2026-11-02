import { describe, expect, it } from 'vitest';
import { resolveApiSurface, resolveRunBackgroundJobs } from '../../src/lib/apiSurface';
import { assertSurfacePrefixes, prefixesFor, surfaceAllows } from '../../src/routes/surfacePolicy';

describe('api surfaces', () => {
  it('keeps the full API when API_SURFACE is unset', () => {
    expect(resolveApiSurface('')).toBe('core');
    expect(resolveApiSurface(undefined)).toBe('core');
    expect(prefixesFor('core')).toContain('/admin');
    expect(prefixesFor('core')).toContain('/payments');
  });

  it('refuses to boot a shop process that mounts admin', () => {
    expect(prefixesFor('shop')).not.toContain('/admin');
    expect(() => assertSurfacePrefixes('shop', ['/orders', '/admin'])).toThrow(/must not mount/);
    expect(surfaceAllows('shop', 'GET', '/api/admin/dashboard')).toBe(false);
    expect(surfaceAllows('shop', 'POST', '/api/auth/admin/login')).toBe(false);
    expect(surfaceAllows('shop', 'POST', '/api/orders')).toBe(true);
    expect(surfaceAllows('shop', 'POST', '/api/orders/payment-notify')).toBe(true);
    expect(surfaceAllows('shop', 'POST', '/api/payments/webxpay-return')).toBe(true);
    expect(() => assertSurfacePrefixes('shop', prefixesFor('shop'))).not.toThrow();
  });

  it('keeps payment callbacks off the admin and cashier processes', () => {
    expect(prefixesFor('admin')).not.toContain('/payments');
    expect(prefixesFor('pos')).not.toContain('/payments');
    expect(surfaceAllows('admin', 'POST', '/api/orders/payment-notify')).toBe(false);
    expect(surfaceAllows('pos', 'POST', '/api/orders/payment-notify')).toBe(false);
    expect(surfaceAllows('admin', 'GET', '/api/admin/dashboard')).toBe(true);
    expect(surfaceAllows('pos', 'POST', '/api/admin/stock/reset')).toBe(false);
    expect(surfaceAllows('pos', 'POST', '/api/orders/order-1/collect-payment')).toBe(true);
    expect(() => assertSurfacePrefixes('pos', prefixesFor('pos'))).not.toThrow();
    expect(() => assertSurfacePrefixes('admin', prefixesFor('admin'))).not.toThrow();
  });

  it('runs background jobs on shop and core only unless forced', () => {
    expect(resolveRunBackgroundJobs('shop', undefined)).toBe(false);
    expect(resolveRunBackgroundJobs('core', undefined)).toBe(true);
    expect(resolveRunBackgroundJobs('pos', undefined)).toBe(false);
    expect(resolveRunBackgroundJobs('admin', undefined)).toBe(false);
    expect(resolveRunBackgroundJobs('admin', 'true')).toBe(true);
    expect(resolveRunBackgroundJobs('shop', 'true')).toBe(true);
    expect(resolveRunBackgroundJobs('shop', 'false')).toBe(false);
  });
});
