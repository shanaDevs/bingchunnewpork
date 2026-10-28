import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDriverSessionVersion } from '@bingchun/delivery-domain';
import { config } from '../config';
import { AppError } from './errorHandler';

export const SESSION_SUPERSEDED = 'SESSION_SUPERSEDED';

/** Compatible with core backend JwtPayload. */
export interface JwtPayload {
  sub: string;
  type: 'user' | 'admin';
  role?: string;
  storeId?: string;
  sv?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function tokenSessionVersion(payload: { sv?: number }): number {
  return typeof payload.sv === 'number' ? payload.sv : 0;
}

export async function assertDriverSession(payload: JwtPayload): Promise<void> {
  if (payload.role !== 'DELIVERY_DRIVER') return;
  const tokenSv = tokenSessionVersion(payload);
  const sessionVersion = await getDriverSessionVersion(payload.sub);
  if (sessionVersion === null || sessionVersion !== tokenSv) {
    throw new AppError('Signed in on another device', 401, SESSION_SUPERSEDED);
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new AppError('Unauthorised', 401));

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    if (payload.role === 'DELIVERY_DRIVER') {
      await assertDriverSession(payload);
    }
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError('Invalid or expired token', 401));
  }
}

export function requireDeliveryDriver(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.type !== 'admin') return next(new AppError('Forbidden', 403));
  if (req.user.role !== 'DELIVERY_DRIVER') return next(new AppError('Delivery driver access only', 403));
  next();
}
