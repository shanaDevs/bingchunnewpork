import { describe, expect, it } from 'vitest';
import { buildConfiguredCorsOrigins, normalizeOrigin, parseExtraCorsOrigins } from '@bingchun/cors';

describe('corsOrigins', () => {
  it('normalizes URLs to origins', () => {
    expect(normalizeOrigin('https://shop.example.com/path')).toBe('https://shop.example.com');
    expect(normalizeOrigin('https://admin.example.com/admin')).toBe('https://admin.example.com');
  });

  it('builds allowlist from shop, frontend, admin, and extras', () => {
    const list = buildConfiguredCorsOrigins({
      customerShopUrl: 'https://shop.example.com',
      frontendUrl: 'https://shop.example.com',
      adminUrl: 'https://admin.example.com/admin',
      corsExtraOrigins: 'https://preview.example.com, https://staging.example.com',
    });
    expect(list).toContain('https://shop.example.com');
    expect(list).toContain('https://admin.example.com');
    expect(list).toContain('https://preview.example.com');
    expect(list).toContain('https://staging.example.com');
  });

  it('parseExtraCorsOrigins ignores invalid entries', () => {
    expect(parseExtraCorsOrigins('ftp://bad.example.com, https://ok.example.com')).toEqual([
      'https://ok.example.com',
    ]);
  });
});
