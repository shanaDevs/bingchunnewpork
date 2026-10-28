import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { AppError } from './errorHandler';

export function requireInternalSecret(req: Request, _res: Response, next: NextFunction) {
  const provided = req.headers['x-internal-secret'];
  const expected = config.internalServiceSecret;
  if (typeof provided !== 'string' || !expected) {
    return next(new AppError('Forbidden', 403));
  }
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return next(new AppError('Forbidden', 403));
  }
  next();
}
