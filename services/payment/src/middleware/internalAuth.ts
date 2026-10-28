import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AppError } from './errorHandler';

export function requireInternalSecret(req: Request, _res: Response, next: NextFunction) {
  const provided = req.headers['x-internal-secret'];
  const secret = typeof provided === 'string' ? provided : Array.isArray(provided) ? provided[0] : undefined;
  if (!config.internalServiceSecret || secret !== config.internalServiceSecret) {
    return next(new AppError('Forbidden', 403));
  }
  next();
}
