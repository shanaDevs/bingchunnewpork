import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import { isBranchScopedRole } from '../middleware/auth';
import { getSpacesObject, isPrivateProofKey, spacesObjectKeyFromUrl } from '../lib/spaces';

const settlementsRoot = path.join(__dirname, '..', '..', 'public', 'settlements');
const invoicesRoot = path.join(__dirname, '..', '..', 'public', 'invoices');

function sanitizeSegment(value: string): string {
  const base = path.basename(value);
  if (!base || base === '.' || base === '..') {
    throw new AppError('Invalid file path', 400);
  }
  return base;
}

function resolveFile(root: string, ...segments: string[]): string {
  const resolved = path.resolve(root, ...segments);
  if (!resolved.startsWith(path.resolve(root))) {
    throw new AppError('Forbidden', 403);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new AppError('File not found', 404);
  }
  return resolved;
}

export function serveSettlementReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = sanitizeSegment(String(req.params.storeId || ''));
    const filename = sanitizeSegment(String(req.params.filename || ''));
    const filePath = resolveFile(settlementsRoot, storeId, filename);
    return res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
}

/** Stream a private settlement proof or driver licence. Query: ?url= */
export async function serveSpacesProof(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = typeof req.query.url === 'string' ? req.query.url : '';
    const key = spacesObjectKeyFromUrl(raw);
    if (!key || !isPrivateProofKey(key)) throw new AppError('Invalid proof', 400);

    if (isBranchScopedRole(req.user?.role)) {
      const storeId = req.user?.storeId;
      if (!storeId || !key.includes(`/${storeId}/`)) {
        throw new AppError('Forbidden', 403);
      }
    }

    const object = await getSpacesObject(key);
    if (object.contentType) res.setHeader('Content-Type', object.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    object.body.pipe(res);
  } catch (err) {
    next(err);
  }
}

export function serveInvoiceFile(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = sanitizeSegment(String(req.params.storeId || ''));
    const filename = sanitizeSegment(String(req.params.filename || ''));
    const filePath = resolveFile(invoicesRoot, storeId, filename);
    return res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
}
