import { describe, expect, it } from 'vitest';
import { parseProductImageUrls, resolveProductImageFields } from '../../src/lib/productImages';

describe('product image JSON', () => {
  it('parses a JSON array of urls', () => {
    expect(parseProductImageUrls(['/a.png', '/b.png', '/a.png'])).toEqual(['/a.png', '/b.png']);
  });

  it('parses a JSON string', () => {
    expect(parseProductImageUrls(JSON.stringify(['https://cdn.example/a.png']))).toEqual([
      'https://cdn.example/a.png',
    ]);
  });

  it('uses imageUrls as the gallery and the first url as the cover', () => {
    expect(
      resolveProductImageFields({
        imageUrl: '/old.png',
        imageUrls: ['/one.png', '/two.png'],
      }),
    ).toEqual({
      imageUrl: '/one.png',
      imageUrls: ['/one.png', '/two.png', '/old.png'],
    });
  });
});
