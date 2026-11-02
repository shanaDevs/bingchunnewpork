import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../../src/config';
import { uploadDriverAsset, uploadToSpaces, uploadToSpacesAtKey } from '../../src/lib/spaces';

const previous = {
  key: config.doSpaces.key,
  secret: config.doSpaces.secret,
  bucket: config.doSpaces.bucket,
};

afterEach(() => {
  config.doSpaces.key = previous.key;
  config.doSpaces.secret = previous.secret;
  config.doSpaces.bucket = previous.bucket;
});

describe('spaces uploads require a bucket', () => {
  it('rejects rider photo upload when DO_SPACES_BUCKET is empty', async () => {
    config.doSpaces.key = 'key';
    config.doSpaces.secret = 'secret';
    config.doSpaces.bucket = '';

    await expect(
      uploadDriverAsset(Buffer.from('img'), 'licence.png', 'image/png', 'license'),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringMatching(/DO_SPACES_BUCKET/),
    });
  });

  it('rejects product and keyed uploads when Spaces is not configured', async () => {
    config.doSpaces.key = '';
    config.doSpaces.secret = '';
    config.doSpaces.bucket = '';

    await expect(uploadToSpaces(Buffer.from('img'), 'item.png', 'image/png')).rejects.toMatchObject({
      statusCode: 503,
    });
    await expect(uploadToSpacesAtKey(Buffer.from('img'), 'bingchun/products/item.png')).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});
