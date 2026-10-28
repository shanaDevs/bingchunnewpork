import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomBytes } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler';
import { MAX_UPLOAD_BYTES } from './uploadLimits';
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function settlementsRoot(): string {
  return path.join(__dirname, '..', '..', 'public', 'settlements');
}

function sanitizeExt(originalname: string, mimetype: string): string {
  const ext = path.extname(originalname).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext)) return ext;
  if (mimetype === 'application/pdf') return '.pdf';
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'image/webp') return '.webp';
  return '.jpg';
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const rawStoreId = (req.body?.storeId as string) || 'unknown';
    const storeId = path.basename(rawStoreId).replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown';
    const dir = path.join(settlementsRoot(), storeId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = sanitizeExt(file.originalname, file.mimetype);
    const name = `${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;
    cb(null, name);
  },
});

export const settlementReceiptUpload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new AppError('Receipt must be a JPEG, PNG, WebP image, or PDF', 400));
      return;
    }
    cb(null, true);
  },
});

/** Memory upload for payout proofs destined for DigitalOcean Spaces. */
export const settlementProofMemoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new AppError('Proof must be a JPEG, PNG, WebP image, or PDF', 400));
      return;
    }
    cb(null, true);
  },
});

function isAllowedPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

/** Validate payout proof buffer content (image or PDF). */
export function assertAllowedSettlementProof(file: Express.Multer.File): void {
  if (!file.buffer || file.buffer.length === 0) {
    throw new AppError('Invalid proof file content', 400);
  }
  if (file.mimetype === 'application/pdf') {
    if (!isAllowedPdfBuffer(file.buffer)) {
      throw new AppError('Invalid PDF file content', 400);
    }
    return;
  }
  if (!isAllowedImageBuffer(file.buffer)) {
    throw new AppError('Invalid image file content', 400);
  }
}

export function settlementReceiptPublicPath(storeId: string, filename: string): string {
  return `/settlements/${storeId}/${filename}`;
}

/** Move uploaded receipt from staging (e.g. unknown/) into the branch folder. */
export function finalizeSettlementReceiptFile(
  file: Express.Multer.File,
  storeId: string,
): string {
  const destDir = path.join(settlementsRoot(), storeId);
  const destPath = path.join(destDir, file.filename);
  if (file.path !== destPath) {
    fs.mkdirSync(destDir, { recursive: true });
    fs.renameSync(file.path, destPath);
  }
  return settlementReceiptPublicPath(storeId, file.filename);
}

/** Copy an uploaded receipt into a branch folder (for bulk settlement). */
export function copySettlementReceiptForStore(
  sourceFile: Express.Multer.File,
  storeId: string,
): string {
  const ext = sanitizeExt(sourceFile.originalname, sourceFile.mimetype);
  const filename = `${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;
  const destDir = path.join(settlementsRoot(), storeId);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(sourceFile.path, path.join(destDir, filename));
  return settlementReceiptPublicPath(storeId, filename);
}

/** Resolve stored receipt URL to an existing file (handles legacy unknown/ uploads). */
export function resolveSettlementReceiptUrl(
  receiptUrl: string | null | undefined,
  storeId: string,
): string | null {
  if (!receiptUrl) return null;

  const filename = path.basename(receiptUrl);
  const root = settlementsRoot();
  const candidates = [
    receiptUrl,
    settlementReceiptPublicPath(storeId, filename),
    `/settlements/unknown/${filename}`,
  ];

  for (const candidate of candidates) {
    const relative = candidate.replace(/^\//, '').split('/').join(path.sep);
    const absolute = path.join(__dirname, '..', '..', 'public', relative);
    if (fs.existsSync(absolute)) return candidate;
  }

  return receiptUrl;
}

function isAllowedImageBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // WebP (RIFF....WEBP)
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return true;
  }
  return false;
}

export const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.mimetype)) {
      cb(new AppError('Only JPEG, PNG, or WebP images are allowed', 400));
      return;
    }
    cb(null, true);
  },
});

export function assertAllowedImageUpload(file: Express.Multer.File): void {
  if (!file.buffer || !isAllowedImageBuffer(file.buffer)) {
    throw new AppError('Invalid image file content', 400);
  }
}

export const driverImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new AppError('Only image files are allowed', 400));
      return;
    }
    cb(null, true);
  },
});

const driverImageFields = driverImageUpload.fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'licenseImage', maxCount: 1 },
]);

/** Apply driver image multer only for multipart PATCH/POST requests. */
export function optionalDriverImageUpload(req: Request, res: Response, next: NextFunction) {
  if (req.is('multipart/form-data')) {
    return driverImageFields(req, res, next);
  }
  next();
}

