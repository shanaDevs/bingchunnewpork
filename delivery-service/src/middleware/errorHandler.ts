import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { isPrismaConnectivityError } from '../utils/prismaErrors';

export class AppError extends Error {
  statusCode: number;
  code?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, statusCode = 400, code?: string, data?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.data = data;
    this.name = 'AppError';
  }
}

/** Core backend auth throws its own AppError class — instanceof fails across packages. */
function isAppError(err: unknown): err is AppError {
  return (
    err instanceof Error &&
    err.name === 'AppError' &&
    typeof (err as AppError).statusCode === 'number'
  );
}

function sendAppError(res: Response, err: AppError): Response {
  return res.status(err.statusCode).json({
    success: false,
    message: err.message,
    ...(err.code ? { code: err.code } : {}),
    ...(err.data !== undefined ? { data: err.data } : {}),
  });
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
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

  if (isAppError(err)) {
    return sendAppError(res, err);
  }

  if (isPrismaConnectivityError(err)) {
    logger.warn('Database connection dropped', err);
    return res.status(503).json({
      success: false,
      message: 'Database connection was reset. Please try again.',
      code: 'DB_UNAVAILABLE',
    });
  }

  logger.error('Unhandled error', err);
  return res.status(500).json({ success: false, message: 'Internal server error' });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ success: false, message: 'Route not found' });
}
