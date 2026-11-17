import { AppError } from '../middleware/errorHandler';

export function throwIfVehicleBreakdownDomainError(err: unknown): void {
  if (!err || typeof err !== 'object' || !('message' in err)) return;
  const e = err as Error & { statusCode?: number; code?: string };
  if (typeof e.statusCode === 'number') {
    throw new AppError(e.message, e.statusCode, e.code);
  }
}