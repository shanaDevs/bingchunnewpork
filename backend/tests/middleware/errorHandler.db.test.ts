import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { errorHandler } from '../../src/middleware/errorHandler';
import { createMockNext, createMockRes } from '../helpers/express';

describe('errorHandler database disconnect', () => {
  it('answers a reset connection with a retryable 503 instead of a generic 500', () => {
    const res = createMockRes();
    const err = Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' });

    errorHandler(err, {} as Request, res, createMockNext());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Database connection was reset. Please try again.',
      code: 'DB_UNAVAILABLE',
    });
  });
});
