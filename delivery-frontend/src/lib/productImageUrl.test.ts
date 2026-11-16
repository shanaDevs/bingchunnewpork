import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveProductImageUrl } from './productImageUrl';

describe('resolveProductImageUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefixes /products paths with the shop origin on the delivery portal', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://shop.example');
    expect(resolveProductImageUrl('/products/Milk-Tea.png')).toBe(
      'https://shop.example/products/Milk-Tea.png',
    );
  });

  it('rewrites avif product paths to png before prefixing', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://shop.example');
    expect(resolveProductImageUrl('/products/Milk-Tea.avif')).toBe(
      'https://shop.example/products/Milk-Tea.png',
    );
  });

  it('leaves absolute URLs in place', () => {
    expect(resolveProductImageUrl('https://cdn.example/a.png')).toBe('https://cdn.example/a.png');
  });
});
