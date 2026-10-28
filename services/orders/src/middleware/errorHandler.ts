import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issues = (err as any).issues || (err as any).errors || [];
    return res.status(422).json({
      success: false,
      message: 'Validation error',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      details: issues.map((e: any) => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  if (err instanceof AppError) {
    return res
      .status(err.statusCode)
      .json({ success: false, message: err.message, ...(err.code ? { code: err.code } : {}) });
  }

  logger.error('Unhandled error', err);
  return res.status(500).json({ success: false, message: 'Internal server error' });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ success: false, message: 'Route not found' });
}
