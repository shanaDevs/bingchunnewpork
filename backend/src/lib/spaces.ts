import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectAclCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { randomBytes } from 'crypto';
import path from 'path';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * DO Spaces: SDK uses the regional endpoint.
 * Public links use path-style when the bucket name contains a dot — virtual-hosted
 * hostnames like `bucket.with.dots.sgp1.digitaloceanspaces.com` fail TLS because
 * the Spaces wildcard cert only covers `*.sgp1.digitaloceanspaces.com`.
 */

/** Dotted bucket names must use path-style. Virtual-hosted hosts fail the Spaces TLS cert. */
export function spacesRequestsUsePathStyle(bucket: string): boolean {
  return bucket.includes('.');
}

/**
 * Spaces rejects the flexible checksum query that AWS SDK v3 adds by default
 * (`x-amz-checksum-mode`). Presigned GETs must only checksum when the API requires it.
 */
export function createSpacesS3Client(input: {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): S3Client {
  return new S3Client({
    region: input.region,
    endpoint: `https://${input.region}.digitaloceanspaces.com`,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    },
    forcePathStyle: spacesRequestsUsePathStyle(input.bucket),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 10_000,
      requestTimeout: 60_000,
    }),
  });
}

const s3 = createSpacesS3Client({
  region: config.doSpaces.region,
  bucket: config.doSpaces.bucket,
  accessKeyId: config.doSpaces.key,
  secretAccessKey: config.doSpaces.secret,
});

function pathStyleBase(bucket: string, region: string): string {
  return `https://${region}.digitaloceanspaces.com/${bucket}`;
}

function virtualHostedBase(bucket: string, region: string): string {
  return `https://${bucket}.${region}.digitaloceanspaces.com`;
}

/** Public base URL for object links (no trailing slash). */
export function getSpacesPublicBase(): string {
  const { bucket, region, endpoint } = config.doSpaces;
  const configured = endpoint?.replace(/\/$/, '') || '';
  const pathStyle = pathStyleBase(bucket, region);
  const virtualHosted = virtualHostedBase(bucket, region);

  if (!configured) {
    // Prefer path-style whenever the bucket name has a dot (TLS-safe).
    return bucket.includes('.') ? pathStyle : virtualHosted;
  }

  // Misconfigured virtual-hosted endpoint for a dotted bucket → force path-style.
  if (bucket.includes('.') && configured === virtualHosted) {
    return pathStyle;
  }

  return configured;
}

const cdnBase = getSpacesPublicBase();
const legacyVirtualHostedBase = virtualHostedBase(config.doSpaces.bucket, config.doSpaces.region);

/**
 * Rewrite a virtual-hosted Spaces URL to path-style when the bucket has a dot.
 * Safe no-op for other URLs.
 */
export function rewriteSpacesPublicUrl(fileUrl: string): string {
  if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) return fileUrl;

  const { bucket, region } = config.doSpaces;
  if (!bucket || !bucket.includes('.')) return fileUrl;

  const brokenBase = virtualHostedBase(bucket, region);
  if (fileUrl === brokenBase || fileUrl.startsWith(`${brokenBase}/`)) {
    const key = fileUrl.slice(brokenBase.length).replace(/^\//, '');
    return key ? `${pathStyleBase(bucket, region)}/${key}` : pathStyleBase(bucket, region);
  }

  // Generic: https://{bucket}.{region}.digitaloceanspaces.com/{key}
  const m = fileUrl.match(
    /^https?:\/\/(.+)\.([a-z0-9]+)\.digitaloceanspaces\.com\/(.+)$/i,
  );
  if (m) {
    const [, hostBucket, hostRegion, key] = m;
    if (hostBucket.includes('.')) {
      return `https://${hostRegion}.digitaloceanspaces.com/${hostBucket}/${key}`;
    }
  }

  return fileUrl;
}

/**
 * Upload a buffer to DigitalOcean Spaces.
 * Returns the full public URL (path-style when needed for TLS).
 */
export async function uploadToSpaces(
  buffer: Buffer,
  originalName: string,
  contentType: string,
): Promise<string> {
  assertSpacesConfigured();
  const ext = path.extname(originalName).toLowerCase() || '.png';
  const uniqueName = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  const key = `${config.doSpaces.prefix}/products/${uniqueName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.doSpaces.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
    }),
  );

  const cdnUrl = `${cdnBase}/${key}`;
  logger.info(`Uploaded product image to DO Spaces: ${cdnUrl}`);
  return cdnUrl;
}

export function isSpacesConfigured(): boolean {
  return Boolean(config.doSpaces.key && config.doSpaces.secret && config.doSpaces.bucket);
}

function assertSpacesConfigured(): void {
  if (!isSpacesConfigured()) {
    throw new AppError(
      'DigitalOcean Spaces is not configured. Set DO_SPACES_KEY, DO_SPACES_SECRET, and DO_SPACES_BUCKET.',
      503,
    );
  }
}

function mimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

/** Upload (or overwrite) an object at a stable key. Used for menu photo backfill. */
export async function uploadToSpacesAtKey(
  buffer: Buffer,
  objectKey: string,
  contentType?: string,
): Promise<string> {
  assertSpacesConfigured();
  const key = objectKey.replace(/^\/+/, '');
  await s3.send(
    new PutObjectCommand({
      Bucket: config.doSpaces.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || mimeFromFilename(key),
      ACL: 'public-read',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  const cdnUrl = `${cdnBase}/${key}`;
  logger.info(`Uploaded to DO Spaces: ${cdnUrl}`);
  return cdnUrl;
}

/**
 * Upload a driver profile or licence image to DigitalOcean Spaces.
 */
export async function uploadDriverAsset(
  buffer: Buffer,
  originalName: string,
  contentType: string,
  kind: 'profile' | 'license',
): Promise<string> {
  assertSpacesConfigured();
  const ext = path.extname(originalName).toLowerCase() || '.png';
  const uniqueName = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  const key = `${config.doSpaces.prefix}/drivers/${kind}/${uniqueName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.doSpaces.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: kind === 'license' ? 'private' : 'public-read',
    }),
  );

  const cdnUrl = `${cdnBase}/${key}`;
  logger.info(`Uploaded driver ${kind} image to DO Spaces: ${cdnUrl}`);
  return cdnUrl;
}

/**
 * Upload a branch payout payment slip / receipt to DigitalOcean Spaces.
 * Key: `{prefix}/settlements/{storeId}/{timestamp}-{hex}{ext}`
 */
export async function uploadSettlementProof(
  buffer: Buffer,
  originalName: string,
  contentType: string,
  storeId: string,
): Promise<string> {
  assertSpacesConfigured();

  const safeStoreId = storeId.replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown';
  const ext = path.extname(originalName).toLowerCase() || '.png';
  const uniqueName = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  const key = `${config.doSpaces.prefix}/settlements/${safeStoreId}/${uniqueName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.doSpaces.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'private',
    }),
  );

  const cdnUrl = `${cdnBase}/${key}`;
  logger.info(`Uploaded private settlement proof to DO Spaces: key=${key}`);
  return cdnUrl;
}

/** Short-lived presigned GET for private proof objects. */
export async function createSignedSpacesGetUrl(
  objectKey: string,
  ttlSeconds = config.doSpaces.proofUrlTtlSeconds,
): Promise<{ url: string; expiresAt: string }> {
  assertSpacesConfigured();
  const command = new GetObjectCommand({
    Bucket: config.doSpaces.bucket,
    Key: objectKey,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: ttlSeconds });
  return {
    url,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}

/** Presign a stored Spaces proof URL, or null when not a private proof object in this bucket. */
export async function createSignedProofAccessFromStoredUrl(
  storedUrl: string | null | undefined,
): Promise<{ url: string; expiresAt: string } | null> {
  if (!storedUrl) return null;
  const key = spacesObjectKeyFromUrl(storedUrl);
  if (!key || !isPrivateProofKey(key)) return null;
  return createSignedSpacesGetUrl(key);
}

/**
 * Licence images are stored private. Clients receive a short-lived GET URL
 * when the stored value is a private Spaces object, otherwise the original URL.
 */
export async function viewableLicenseImageUrl(
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored) return null;
  try {
    const signed = await createSignedProofAccessFromStoredUrl(stored);
    return signed?.url ?? stored;
  } catch (err) {
    logger.warn('Licence presign skipped for rider profile', err);
    return null;
  }
}

/** Avoid blocking rider profile on slow Spaces presign (e.g. go-online refresh). */
export async function viewableLicenseImageUrlWithTimeout(
  stored: string | null | undefined,
  timeoutMs = 2500,
): Promise<string | null> {
  if (!stored) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      viewableLicenseImageUrl(stored),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Object key from a stored Spaces URL, or null when the URL is not in this bucket. */
export function spacesObjectKeyFromUrl(fileUrl: string): string | null {
  if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) return null;
  const rewritten = rewriteSpacesPublicUrl(fileUrl);
  const bases = [
    `${cdnBase}/`,
    `${pathStyleBase(config.doSpaces.bucket, config.doSpaces.region)}/`,
    `${legacyVirtualHostedBase}/`,
  ];
  for (const base of bases) {
    if (rewritten.startsWith(base)) return rewritten.slice(base.length);
  }
  return null;
}

export function isPrivateProofKey(key: string): boolean {
  const prefix = config.doSpaces.prefix.replace(/^\/+|\/+$/g, '');
  return (
    key.includes('/settlements/')
    || key.includes('/drivers/license/')
    || key.startsWith(`${prefix}/settlements/`)
    || key.startsWith(`${prefix}/drivers/license/`)
  );
}

/** Stream a private Spaces object. Caller must already authorize the key. */
export async function getSpacesObject(key: string): Promise<{ body: NodeJS.ReadableStream; contentType?: string }> {
  const result = await s3.send(new GetObjectCommand({
    Bucket: config.doSpaces.bucket,
    Key: key,
  }));
  if (!result.Body) throw new Error('Empty object');
  return {
    body: result.Body as NodeJS.ReadableStream,
    contentType: result.ContentType,
  };
}

/** One-off: make existing settlement and licence objects private. */
export async function privatizeProofObjects(): Promise<number> {
  const prefix = `${config.doSpaces.prefix}/`;
  let token: string | undefined;
  let changed = 0;
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: config.doSpaces.bucket,
      Prefix: prefix,
      ContinuationToken: token,
    }));
    for (const item of page.Contents ?? []) {
      if (!item.Key || !isPrivateProofKey(item.Key)) continue;
      await s3.send(new PutObjectAclCommand({
        Bucket: config.doSpaces.bucket,
        Key: item.Key,
        ACL: 'private',
      }));
      changed += 1;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return changed;
}

/**
 * Delete an object from DigitalOcean Spaces by its full URL.
 * Silently ignores errors (best-effort cleanup).
 */
export async function deleteFromSpaces(fileUrl: string): Promise<void> {
  try {
    let key: string | null = null;

    if (fileUrl.startsWith(`${cdnBase}/`)) {
      key = fileUrl.slice(cdnBase.length + 1);
    } else if (fileUrl.startsWith(`${legacyVirtualHostedBase}/`)) {
      key = fileUrl.slice(legacyVirtualHostedBase.length + 1);
    } else {
      const rewritten = rewriteSpacesPublicUrl(fileUrl);
      if (rewritten.startsWith(`${pathStyleBase(config.doSpaces.bucket, config.doSpaces.region)}/`)) {
        key = rewritten.slice(pathStyleBase(config.doSpaces.bucket, config.doSpaces.region).length + 1);
      }
    }

    if (!key) return;

    await s3.send(
      new DeleteObjectCommand({
        Bucket: config.doSpaces.bucket,
        Key: key,
      }),
    );
    logger.info(`Deleted from DO Spaces: ${key}`);
  } catch (err) {
    logger.warn('Failed to delete from DO Spaces (non-fatal)', err);
  }
}

/** Lightweight connectivity check for ops (/health/spaces). */
export async function probeSpacesReachability(timeoutMs = 5000): Promise<{
  configured: boolean;
  reachable: boolean;
  error?: string;
}> {
  if (!isSpacesConfigured()) {
    return { configured: false, reachable: false };
  }
  try {
    await Promise.race([
      s3.send(
        new ListObjectsV2Command({
          Bucket: config.doSpaces.bucket,
          MaxKeys: 1,
        }),
      ),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Spaces probe timed out')), timeoutMs);
      }),
    ]);
    return { configured: true, reachable: true };
  } catch (err) {
    return {
      configured: true,
      reachable: false,
      error: err instanceof Error ? err.message : 'Spaces probe failed',
    };
  }
}
