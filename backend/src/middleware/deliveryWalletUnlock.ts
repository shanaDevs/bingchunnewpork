import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import {
  DELIVERY_WALLET_UNLOCK_HEADER,
  verifyDeliveryWalletUnlockToken,
} from '../lib/deliveryWalletUnlock';

function readUnlockHeader(req: Request): string | null {
  const raw = req.headers[DELIVERY_WALLET_UNLOCK_HEADER];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return null;
}

export function requireDeliveryWalletUnlock(req: Request, _res: Response, next: NextFunction) {
  try {
    const adminId = req.user?.sub;
    if (!adminId) throw new AppError('Delivery wallet PIN required', 401);
    const token = readUnlockHeader(req);
    if (!token) throw new AppError('Delivery wallet PIN required', 401);
    verifyDeliveryWalletUnlockToken(token, adminId);
    next();
  } catch (err) {
    next(err);
  }
}
