import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('isCorsAllowedOrigin production matrix', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('allows separate admin host when configured', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LIVE_SHOP_URL = 'https://shop.example.com';
    process.env.FRONTEND_URL = 'https://shop.example.com';
    process.env.ADMIN_URL = 'https://admin.example.com/admin';
    process.env.API_BASE_URL = 'https://api.example.com';

    const { isCorsAllowedOrigin, getConfiguredCorsOrigins } = await import('../../src/lib/resolveFrontendUrl');
    expect(getConfiguredCorsOrigins()).toContain('https://admin.example.com');
    expect(isCorsAllowedOrigin('https://admin.example.com')).toBe(true);
    expect(isCorsAllowedOrigin('https://shop.example.com')).toBe(true);
    expect(isCorsAllowedOrigin('https://evil.example.com')).toBe(false);
  });

  it('allows the delivery ops host without treating it as the shop', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LIVE_SHOP_URL = 'https://bing-chun-ui2ow.ondigitalocean.app';
    process.env.FRONTEND_URL = 'https://bing-chun-ui2ow.ondigitalocean.app';
    process.env.ADMIN_URL = 'https://bingchun-admin-a4ndy.ondigitalocean.app/admin';
    process.env.API_BASE_URL = 'https://bing-chun-ui2ow.ondigitalocean.app';
    delete process.env.CORS_EXTRA_ORIGINS;
    delete process.env.DELIVERY_FRONTEND_URL;

    const { isCorsAllowedOrigin, getConfiguredCorsOrigins } = await import('../../src/lib/resolveFrontendUrl');
    expect(getConfiguredCorsOrigins()).toContain('https://bingchun-delivery-6mgs2.ondigitalocean.app');
    expect(isCorsAllowedOrigin('https://bingchun-delivery-6mgs2.ondigitalocean.app')).toBe(true);
    expect(isCorsAllowedOrigin('https://bing-chun-ui2ow.ondigitalocean.app')).toBe(true);
  });

  it('allows DO admin and pos surface hosts', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LIVE_SHOP_URL = 'https://bing-chun-ui2ow.ondigitalocean.app';
    process.env.FRONTEND_URL = 'https://bing-chun-ui2ow.ondigitalocean.app';
    process.env.ADMIN_URL = 'https://bingchun-admin-a4ndy.ondigitalocean.app/admin';
    process.env.API_BASE_URL = 'https://bingchun-admin-a4ndy.ondigitalocean.app';
    delete process.env.CORS_EXTRA_ORIGINS;

    const { isCorsAllowedOrigin, getConfiguredCorsOrigins } = await import('../../src/lib/resolveFrontendUrl');
    expect(getConfiguredCorsOrigins()).toContain('https://bingchun-admin-a4ndy.ondigitalocean.app');
    expect(getConfiguredCorsOrigins()).toContain('https://bingchun-pos-i8pq3.ondigitalocean.app');
    expect(isCorsAllowedOrigin('https://bingchun-admin-a4ndy.ondigitalocean.app')).toBe(true);
    expect(isCorsAllowedOrigin('https://bingchun-pos-i8pq3.ondigitalocean.app')).toBe(true);
  });

  it('allows LAN origins only outside production deployment', async () => {
    process.env.NODE_ENV = 'development';
    process.env.API_BASE_URL = 'http://localhost:4000';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    const { isCorsAllowedOrigin } = await import('../../src/lib/resolveFrontendUrl');
    expect(isCorsAllowedOrigin('http://192.168.1.50:3000')).toBe(true);
  });

  it('allows dedicated admin-web and pos-web hosts when ADMIN_WEB_URL / POS_WEB_URL are set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LIVE_SHOP_URL = 'https://bing-chun-ui2ow.ondigitalocean.app';
    process.env.FRONTEND_URL = 'https://bing-chun-ui2ow.ondigitalocean.app';
    process.env.ADMIN_URL = 'https://bingchun-admin-a4ndy.ondigitalocean.app/admin';
    process.env.ADMIN_WEB_URL = 'https://bingchun-admin-a4ndy.ondigitalocean.app';
    process.env.POS_WEB_URL = 'https://bingchun-pos-i8pq3.ondigitalocean.app';
    process.env.API_BASE_URL = 'https://bingchun-admin-a4ndy.ondigitalocean.app';
    delete process.env.CORS_EXTRA_ORIGINS;

    const { isCorsAllowedOrigin, getConfiguredCorsOrigins } = await import('../../src/lib/resolveFrontendUrl');
    expect(getConfiguredCorsOrigins()).toContain('https://bingchun-admin-a4ndy.ondigitalocean.app');
    expect(getConfiguredCorsOrigins()).toContain('https://bingchun-pos-i8pq3.ondigitalocean.app');
    expect(isCorsAllowedOrigin('https://bingchun-admin-a4ndy.ondigitalocean.app')).toBe(true);
    expect(isCorsAllowedOrigin('https://bingchun-pos-i8pq3.ondigitalocean.app')).toBe(true);
  });
});
