import { describe, expect, it, vi } from 'vitest';
import { errorHandler, AppError } from '../src/middleware/errorHandler';

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe('errorHandler AppError', () => {
  it('returns local AppError status and message', () => {
    const res = mockRes();
    errorHandler(new AppError('Forbidden', 403), {} as never, res as never, vi.fn());
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, message: 'Forbidden' });
  });

  it('returns cross-package AppError by duck typing', () => {
    const backendErr = new Error('Invalid CSRF token') as Error & {
      statusCode: number;
      name: string;
    };
    backendErr.name = 'AppError';
    backendErr.statusCode = 403;

    const res = mockRes();
    errorHandler(backendErr, {} as never, res as never, vi.fn());
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, message: 'Invalid CSRF token' });
  });
});
