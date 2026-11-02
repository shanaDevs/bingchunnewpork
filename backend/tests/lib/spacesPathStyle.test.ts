import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { describe, expect, it } from 'vitest';
import { createSpacesS3Client, spacesRequestsUsePathStyle } from '../../src/lib/spaces';

describe('spacesRequestsUsePathStyle', () => {
  it('uses path-style for dotted bucket names so the Spaces TLS cert matches', () => {
    expect(spacesRequestsUsePathStyle('dartcodes.data')).toBe(true);
  });

  it('keeps virtual-hosted requests for a single-label bucket', () => {
    expect(spacesRequestsUsePathStyle('bingchun')).toBe(false);
  });
});

describe('createSpacesS3Client presign', () => {
  it('presigns a dotted bucket as path-style without flexible checksum query params', async () => {
    const bucket = 'dartcodes.data';
    const region = 'sgp1';
    const client = createSpacesS3Client({
      region,
      bucket,
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key-not-real',
    });

    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: 'bingchun/drivers/license/licence.jpg',
      }),
      { expiresIn: 600 },
    );

    const parsed = new URL(url);
    expect(parsed.host).toBe(`${region}.digitaloceanspaces.com`);
    expect(parsed.host).not.toBe(`${bucket}.${region}.digitaloceanspaces.com`);
    expect(parsed.pathname.startsWith(`/${bucket}/`)).toBe(true);
    expect(parsed.searchParams.has('x-amz-checksum-mode')).toBe(false);
    expect(parsed.searchParams.has('x-amz-sdk-checksum-algorithm')).toBe(false);
  });
});
