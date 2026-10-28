import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { MAX_UPLOAD_LABEL, UPLOAD_FIELD_LABELS } from './uploadLimits';
import { logger } from '../utils/logger';
import { isPrismaConnectivityError } from '../utils/prismaErrors';

const { MulterError } = multer;

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

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.data !== undefined ? { data: err.data } : {}),
    });
  }

  if (isPrismaConnectivityError(err)) {
    logger.warn('Database connection dropped', err);
    return res.status(503).json({
      success: false,
      message: 'Database connection was reset. Please try again.',
      code: 'DB_UNAVAILABLE',
    });
  }

  if (err instanceof MulterError) {
    const label = UPLOAD_FIELD_LABELS[err.field ?? ''] ?? 'File';
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `${label} must be ${MAX_UPLOAD_LABEL} or smaller`
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Unexpected upload field: ${err.field}`
          : err.message;
    return res.status(400).json({ success: false, message });
  }

  logger.error('Unhandled error', err);
  return res.status(500).json({ success: false, message: 'Internal server error' });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ success: false, message: 'Route not found' });
}
